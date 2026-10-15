// Port of ActiveSupport::CurrentAttributes, isolated per async context with
// AsyncLocalStorage (Rails isolates per thread/fiber).
//
//   class Current extends CurrentAttributes {
//     static {
//       this.attribute("account", "user");
//       this.attribute("locale", { default: "en" });
//       this.resets(() => Time.zone = null);
//     }
//   }
//
//   // per request:
//   await CurrentAttributes.wrap(async () => {
//     Current.user = await authenticate(req)
//     await handle(req)            // anything awaited here sees Current.user
//   })
//
//   Current.set({ user: admin }, () => doSomething())  // temporarily override
//
// Outside wrap() a single process-wide context is used.
//
// Accessors made by attribute() are defined at runtime, so TypeScript can't
// see them; declare them on the subclass (`declare static user: User`) to type
// them.
import { AsyncLocalStorage } from "node:async_hooks";

/** @type {AsyncLocalStorage<Map<Function, CurrentAttributes>>} */
const storage = new AsyncLocalStorage();
/** @type {Map<Function, CurrentAttributes>} */
const globalContext = new Map();

const context = () => storage.getStore() ?? globalContext;

/**
 * @typedef {object} AttributeDefinitions
 * @property {Map<string, unknown>} attributes Attribute names and their defaults.
 * @property {Array<(this: typeof CurrentAttributes) => void>} before
 * @property {Array<(this: typeof CurrentAttributes) => void>} after
 */

/**
 * @typedef {object} AttributeOptions
 * @property {unknown} [default] A value (deep-copied per context) or a function returning one.
 */

export class CurrentAttributes {
  /** @type {WeakMap<Function, AttributeDefinitions>} */
  static #definitions = new WeakMap(); // class => { attributes: Map<name, default>, before: [], after: [] }

  /**
   * @param {Function} [klass]
   * @returns {AttributeDefinitions}
   */
  static #defs(klass = this) {
    if (!CurrentAttributes.#definitions.has(klass)) {
      const parent = Object.getPrototypeOf(klass);
      const inherited = parent && parent !== CurrentAttributes && parent.prototype instanceof CurrentAttributes
        ? CurrentAttributes.#defs(parent)
        : { attributes: new Map(), before: [], after: [] };
      CurrentAttributes.#definitions.set(klass, {
        attributes: new Map(inherited.attributes),
        before: [...inherited.before],
        after: [...inherited.after],
      });
    }
    return CurrentAttributes.#definitions.get(klass);
  }

  /**
   * Runs fn in a fresh, isolated set of current attributes. Use it around
   * each request or job, like Rails' executor does.
   * @template T
   * @param {() => T} fn
   * @returns {T}
   */
  static wrap(fn) {
    return storage.run(new Map(), fn);
  }

  /**
   * The instance for the current async context.
   * @returns {CurrentAttributes}
   */
  static get instance() {
    const ctx = context();
    if (!ctx.has(this)) ctx.set(this, new this());
    return ctx.get(this);
  }

  /**
   * @param {...(string | AttributeOptions)} args Attribute names, optionally followed by options.
   * @returns {void}
   */
  static attribute(...args) {
    const names = /** @type {any[]} */ (args);
    /** @type {AttributeOptions} */
    const options = typeof names.at(-1) === "object" && names.at(-1) !== null ? names.pop() : {};
    const defs = CurrentAttributes.#defs(this);
    for (const name of names) {
      defs.attributes.set(name, options.default);
      Object.defineProperty(this, name, {
        get() { return this.instance[name]; },
        set(v) { this.instance[name] = v; },
        configurable: true,
      });
      Object.defineProperty(this.prototype, name, {
        get() { return this.attributes[name]; },
        set(v) { this.attributes[name] = v; },
        configurable: true,
      });
    }
  }

  /**
   * @param {(this: typeof CurrentAttributes) => void} fn
   * @returns {void}
   */
  static beforeReset(fn) { CurrentAttributes.#defs(this).before.push(fn); }
  /**
   * @param {(this: typeof CurrentAttributes) => void} fn
   * @returns {void}
   */
  static resets(fn) { CurrentAttributes.#defs(this).after.push(fn); }
  /**
   * @param {(this: typeof CurrentAttributes) => void} fn
   * @returns {void}
   */
  static afterReset(fn) { this.resets(fn); }

  /**
   * @template T
   * @param {Record<string, unknown>} attributes
   * @param {() => T} fn
   * @returns {T}
   */
  static set(attributes, fn) { return this.instance.set(attributes, fn); }
  /** @returns {void} */
  static reset() { this.instance.reset(); }

  /**
   * Resets every CurrentAttributes subclass in the current context.
   * @returns {void}
   */
  static resetAll() {
    for (const instance of context().values()) instance.reset();
  }

  /** @returns {void} */
  static clearAll() {
    context().clear();
  }

  /** @returns {string[]} */
  static get attributeNames() {
    return [...CurrentAttributes.#defs(this).attributes.keys()];
  }

  constructor() {
    /** @type {Record<string, any>} */
    this.attributes = this.#defaults();
  }

  #defaults() {
    /** @type {Record<string, unknown>} */
    const out = {};
    for (const [name, def] of CurrentAttributes.#defs(this.constructor).attributes) {
      out[name] = typeof def === "function" ? def() : structuredCloneIfPossible(def);
    }
    return out;
  }

  /**
   * Sets attributes for the duration of fn, then restores the previous values.
   * @template T
   * @param {Record<string, unknown>} attributes
   * @param {() => T} fn
   * @returns {T}
   */
  set(attributes, fn) {
    /** @type {Record<string, unknown>} */
    const previous = {};
    for (const key of Object.keys(attributes)) {
      if (!CurrentAttributes.#defs(this.constructor).attributes.has(key)) {
        throw new TypeError(`Unknown attribute: ${key}`);
      }
      previous[key] = this.attributes[key];
    }
    Object.assign(this.attributes, attributes);
    const restore = () => Object.assign(this.attributes, previous);
    /** @type {any} */
    let result;
    try {
      result = fn();
    } catch (e) {
      restore();
      throw e;
    }
    if (result && typeof result.then === "function") return result.finally(restore);
    restore();
    return result;
  }

  /** @returns {void} */
  reset() {
    const defs = CurrentAttributes.#defs(this.constructor);
    for (const fn of defs.before) fn.call(this.constructor);
    this.attributes = this.#defaults();
    for (const fn of defs.after) fn.call(this.constructor);
  }
}

/**
 * @param {unknown} value
 * @returns {unknown}
 */
function structuredCloneIfPossible(value) {
  if (value === null || typeof value !== "object") return value;
  try {
    return structuredClone(value);
  } catch {
    return value;
  }
}
