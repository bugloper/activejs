// Port of ActiveSupport::Callbacks.
//
//   class Record extends Callbacks() {
//     static {
//       this.defineCallbacks("save");
//       this.setCallback("save", "before", "validate");
//       this.setCallback("save", "around", (record, next) => { log("in"); next(); log("out"); });
//       this.setCallback("save", "after", "notify", { if: "persisted" });
//     }
//     validate() { if (!this.valid) abort(); }  // halts the chain, like throw :abort
//     save() { return this.runCallbacks("save", () => this.persist()); }
//   }
//
// Semantics follow Rails: before callbacks run in definition order, around
// callbacks nest (first defined is outermost), and after callbacks run in
// reverse definition order and still run when a before callback halts
// (unless the chain sets skipAfterCallbacksIfTerminated).

/** @typedef {"before" | "after" | "around"} CallbackKind */

/**
 * A callback: the name of a method on the target, a function receiving the
 * target (around callbacks also receive `next`), or a callback object with a
 * method named after the kind and chain, e.g. `{ beforeSave(record) {} }`.
 * @typedef {string | ((target: any, ...args: any[]) => unknown) | Record<string, any>} CallbackFilter
 */

/**
 * An `if`/`unless` condition: a method or property name on the target, a
 * function receiving the target, or a plain value.
 * @typedef {string | ((target: any) => unknown) | unknown} CallbackCondition
 */

/**
 * @typedef {object} CallbackOptions
 * @property {CallbackCondition | CallbackCondition[]} [if]
 * @property {CallbackCondition | CallbackCondition[]} [unless]
 * @property {boolean} [prepend]
 * @property {boolean} [raise] Only for skipCallback: false ignores undefined callbacks.
 */

/**
 * @typedef {object} CallbackChainOptions
 * @property {boolean} [skipAfterCallbacksIfTerminated]
 * @property {(target: any, resultFn: () => unknown) => boolean | Promise<boolean>} [terminator]
 *   Decides whether a before callback halted the chain.
 * @property {(target: any, filter: CallbackFilter) => void} [onHalt]
 * @property {unknown[]} [scope]
 */

/**
 * @typedef {object} Callback
 * @property {CallbackKind} kind
 * @property {CallbackFilter} filter
 * @property {CallbackCondition[]} if
 * @property {CallbackCondition[]} unless
 */

const ABORT = Symbol("activejs.callbacks.abort");

/**
 * Halts the callback chain from inside a before/around callback.
 * @returns {never}
 */
export function abort() {
  throw ABORT;
}

/** @param {unknown} e */
const isAbort = (e) => e === ABORT;

/** @type {(target: any, resultFn: () => unknown) => boolean | PromiseLike<unknown>} */
const DEFAULT_TERMINATOR = (target, resultFn) => {
  try {
    const result = /** @type {any} */ (resultFn());
    // Hand an async filter's promise back so the sync runner can reject it.
    if (result && typeof result.then === "function") return result;
    return false;
  } catch (e) {
    if (isAbort(e)) return true;
    throw e;
  }
};

/** @type {(target: any, resultFn: () => unknown) => Promise<boolean>} */
const ASYNC_DEFAULT_TERMINATOR = async (target, resultFn) => {
  try {
    await resultFn();
    return false;
  } catch (e) {
    if (isAbort(e)) return true;
    throw e;
  }
};

/** @type {WeakMap<Function, Record<string, CallbackChain>>} */
const chains = new WeakMap(); // class => { [name]: CallbackChain }

class CallbackChain {
  /**
   * @param {string} name
   * @param {CallbackChainOptions} [config]
   */
  constructor(name, config = {}) {
    this.name = name;
    /** @type {CallbackChainOptions} */
    this.config = { skipAfterCallbacksIfTerminated: false, scope: [], ...config };
    /** @type {Callback[]} */
    this.callbacks = [];
  }

  clone() {
    const copy = new CallbackChain(this.name, this.config);
    copy.callbacks = [...this.callbacks];
    return copy;
  }

  /**
   * @param {Callback} callback
   * @param {boolean} [prepend]
   */
  append(callback, prepend) {
    this.remove(callback.kind, callback.filter);
    if (prepend) this.callbacks.unshift(callback);
    else this.callbacks.push(callback);
  }

  /**
   * @param {CallbackKind} kind
   * @param {CallbackFilter} filter
   */
  remove(kind, filter) {
    this.callbacks = this.callbacks.filter((cb) => !(cb.kind === kind && cb.filter === filter));
  }
}

/**
 * @template T
 * @param {T | T[] | undefined | null} v
 * @returns {T[]}
 */
const toArray = (v) => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]);

/**
 * @param {any} target
 * @param {CallbackCondition} condition
 * @param {...unknown} args
 */
function evaluate(target, condition, ...args) {
  if (typeof condition === "string") {
    const member = target[condition];
    return typeof member === "function" ? member.apply(target, args) : member;
  }
  if (typeof condition === "function") return condition.call(target, target, ...args);
  return condition;
}

// Objects can act as callbacks by implementing a method named after the
// timing and chain, e.g. { beforeSave(record) {} }, like Rails callback objects.
/**
 * @param {any} target
 * @param {Callback} callback
 * @param {string} chainName
 * @param {unknown[]} extra
 * @returns {unknown}
 */
function invokeFilter(target, callback, chainName, extra) {
  const { filter, kind } = callback;
  if (typeof filter === "string") return target[filter](...extra);
  if (typeof filter === "function") return filter.call(target, target, ...extra);
  const method = `${kind}${chainName[0].toUpperCase()}${chainName.slice(1)}`;
  if (filter && typeof filter[method] === "function") return filter[method](target, ...extra);
  throw new TypeError(`Callback object must respond to ${method}`);
}

/**
 * @param {any} target
 * @param {Callback} callback
 */
function conditionsPass(target, callback) {
  return (
    callback.if.every((c) => evaluate(target, c)) &&
    callback.unless.every((c) => !evaluate(target, c))
  );
}

/** @param {Function} klass */
function ownChains(klass) {
  if (!chains.has(klass)) chains.set(klass, {});
  return chains.get(klass);
}

/**
 * Walks up the class hierarchy to find the nearest chain definition.
 * @param {Function} klass
 * @param {string} name
 * @returns {CallbackChain | undefined}
 */
function findChain(klass, name) {
  for (let k = klass; k && k !== Function.prototype; k = Object.getPrototypeOf(k)) {
    const own = chains.get(k)?.[name];
    if (own) return own;
  }
  return undefined;
}

/**
 * Returns a chain owned by klass, copying the inherited one on first write so
 * subclasses never mutate their parent's callbacks.
 * @param {Function} klass
 * @param {string} name
 */
function writableChain(klass, name) {
  const own = ownChains(klass);
  if (own[name]) return own[name];
  const inherited = findChain(klass, name);
  if (!inherited) throw new Error(`No callback chain named "${name}" defined on ${klass.name}`);
  own[name] = inherited.clone();
  return own[name];
}

/**
 * @param {Function} klass
 * @param {...(string | CallbackChainOptions)} args Chain names, optionally followed by chain options.
 * @returns {void}
 */
export function defineCallbacks(klass, ...args) {
  const rest = /** @type {any[]} */ (args);
  const options = typeof rest.at(-1) === "object" ? rest.pop() : {};
  for (const name of rest) ownChains(klass)[name] = new CallbackChain(name, options);
}

/**
 * setCallback(klass, "save", "before", filterOrFn, { if, unless, prepend })
 * The kind defaults to "before" when omitted.
 * @param {Function} klass
 * @param {string} name
 * @param {...(CallbackKind | CallbackFilter | CallbackOptions)} rawArgs
 *   An optional kind, one or more filters, and an optional trailing options object.
 * @returns {void}
 */
export function setCallback(klass, name, ...rawArgs) {
  const args = /** @type {any[]} */ (rawArgs);
  /** @type {CallbackOptions} */
  const options = args.length > 1 && isOptions(args.at(-1)) ? args.pop() : {};
  const kind = ["before", "after", "around"].includes(args[0]) ? args.shift() : "before";
  const chain = writableChain(klass, name);
  for (const filter of args) {
    chain.append(
      { kind, filter, if: toArray(options.if), unless: toArray(options.unless) },
      options.prepend,
    );
  }
}

// A trailing plain object is an options bag only if every key is a known
// option; anything else (e.g. { beforeSave() {} }) is a callback object.
const OPTION_KEYS = ["if", "unless", "prepend", "raise"];
/** @param {unknown} v */
const isOptions = (v) =>
  v !== null && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype &&
  Object.keys(v).every((k) => OPTION_KEYS.includes(k));

/**
 * skipCallback(klass, "save", "before", "validate", { if: ... })
 * Throws if the callback isn't defined, unless { raise: false }.
 * @param {Function} klass
 * @param {string} name
 * @param {...(CallbackKind | CallbackFilter | CallbackOptions)} rawArgs
 * @returns {void}
 */
export function skipCallback(klass, name, ...rawArgs) {
  const args = /** @type {any[]} */ (rawArgs);
  /** @type {CallbackOptions} */
  const options = args.length > 1 && isOptions(args.at(-1)) ? args.pop() : {};
  const kind = ["before", "after", "around"].includes(args[0]) ? args.shift() : "before";
  const chain = writableChain(klass, name);
  for (const filter of args) {
    const existing = chain.callbacks.find((cb) => cb.kind === kind && cb.filter === filter);
    if (!existing) {
      if (options.raise === false) continue;
      throw new Error(`${kind} ${name} callback ${String(filter.name ?? filter)} has not been defined`);
    }
    if (options.if !== undefined || options.unless !== undefined) {
      // Conditionally skip: keep the callback but add the inverted condition.
      chain.remove(kind, filter);
      chain.callbacks.push({
        ...existing,
        unless: [...existing.unless, ...toArray(options.if)],
        if: [...existing.if, ...toArray(options.unless)],
      });
    } else {
      chain.remove(kind, filter);
    }
  }
}

/**
 * @param {Function} klass
 * @param {string} name
 * @returns {void}
 */
export function resetCallbacks(klass, name) {
  const chain = writableChain(klass, name);
  chain.callbacks = [];
}

/**
 * @param {Function} klass
 * @param {string} name
 * @returns {Callback[]}
 */
export function getCallbacks(klass, name) {
  return [...(findChain(klass, name)?.callbacks ?? [])];
}

/**
 * Runs the named chain around `block`. Returns false when halted, otherwise
 * the block's return value (or true when there is no block).
 * @template [T=true]
 * @param {object} target
 * @param {string} name
 * @param {() => T} [block]
 * @returns {T | false}
 */
export function runCallbacks(target, name, block) {
  const chain = findChain(target.constructor, name);
  if (!chain || chain.callbacks.length === 0) return block ? block() : /** @type {T} */ (/** @type {unknown} */ (true));

  const terminator = chain.config.terminator ?? DEFAULT_TERMINATOR;
  const skipAfter = chain.config.skipAfterCallbacksIfTerminated;
  const env = { halted: false, value: undefined };
  const list = chain.callbacks;

  const invoke = (i) => {
    if (i === list.length) {
      env.value = !env.halted && (block ? block() : true);
      return;
    }
    const cb = list[i];
    const passes = conditionsPass(target, cb);
    switch (cb.kind) {
      case "before":
        if (!env.halted && passes) {
          const halted = terminator(target, () => invokeFilter(target, cb, name, []));
          if (halted && typeof (/** @type {any} */ (halted)).then === "function") {
            throw new TypeError(`The "${name}" chain has an async terminator or filter; use runCallbacksAsync`);
          }
          env.halted = /** @type {boolean} */ (halted);
          if (env.halted && typeof chain.config.onHalt === "function") chain.config.onHalt(target, cb.filter);
        }
        invoke(i + 1);
        break;
      case "after":
        invoke(i + 1);
        if (!(skipAfter && env.halted) && passes) invokeFilter(target, cb, name, []);
        break;
      case "around": {
        if (env.halted || !passes) {
          invoke(i + 1);
          break;
        }
        const next = () => {
          invoke(i + 1);
          return env.value;
        };
        try {
          invokeFilter(target, cb, name, [next]);
        } catch (e) {
          if (!isAbort(e)) throw e;
          env.halted = true;
        }
        break;
      }
    }
  };

  invoke(0);
  return env.value;
}

/**
 * Same as runCallbacks, but awaits each callback and the block, so filters
 * may be async functions.
 * @template [T=true]
 * @param {object} target
 * @param {string} name
 * @param {() => T | Promise<T>} [block]
 * @returns {Promise<T | false>}
 */
export async function runCallbacksAsync(target, name, block) {
  const chain = findChain(target.constructor, name);
  if (!chain || chain.callbacks.length === 0) return block ? await block() : /** @type {T} */ (/** @type {unknown} */ (true));

  const terminator = chain.config.terminator ?? ASYNC_DEFAULT_TERMINATOR;
  const skipAfter = chain.config.skipAfterCallbacksIfTerminated;
  const env = { halted: false, value: undefined };
  const list = chain.callbacks;

  const invoke = async (i) => {
    if (i === list.length) {
      env.value = !env.halted && (block ? await block() : true);
      return;
    }
    const cb = list[i];
    const passes = conditionsPass(target, cb);
    switch (cb.kind) {
      case "before":
        if (!env.halted && passes) {
          env.halted = await terminator(target, () => invokeFilter(target, cb, name, []));
          if (env.halted && typeof chain.config.onHalt === "function") chain.config.onHalt(target, cb.filter);
        }
        await invoke(i + 1);
        break;
      case "after":
        await invoke(i + 1);
        if (!(skipAfter && env.halted) && passes) await invokeFilter(target, cb, name, []);
        break;
      case "around": {
        if (env.halted || !passes) {
          await invoke(i + 1);
          break;
        }
        const next = async () => {
          await invoke(i + 1);
          return env.value;
        };
        try {
          await invokeFilter(target, cb, name, [next]);
        } catch (e) {
          if (!isAbort(e)) throw e;
          env.halted = true;
        }
        break;
      }
    }
  };

  await invoke(0);
  return env.value;
}

/**
 * Mixin: class Model extends Callbacks(Base) { ... }
 * @template {new (...args: any[]) => {}} [TBase=new (...args: any[]) => {}]
 * @param {TBase} [Base]
 */
export const Callbacks = (Base = /** @type {TBase} */ (/** @type {unknown} */ (Object))) =>
  class extends Base {
    /**
     * @param {...(string | CallbackChainOptions)} args
     * @returns {void}
     */
    static defineCallbacks(...args) { defineCallbacks(this, ...args); }
    /**
     * @param {string} name
     * @param {...(CallbackKind | CallbackFilter | CallbackOptions)} args
     * @returns {void}
     */
    static setCallback(name, ...args) { setCallback(this, name, ...args); }
    /**
     * @param {string} name
     * @param {...(CallbackKind | CallbackFilter | CallbackOptions)} args
     * @returns {void}
     */
    static skipCallback(name, ...args) { skipCallback(this, name, ...args); }
    /**
     * @param {string} name
     * @returns {void}
     */
    static resetCallbacks(name) { resetCallbacks(this, name); }
    /**
     * @param {string} name
     * @returns {Callback[]}
     */
    static getCallbacks(name) { return getCallbacks(this, name); }
    /**
     * @template [T=true]
     * @param {string} name
     * @param {() => T} [block]
     * @returns {T | false}
     */
    runCallbacks(name, block) { return runCallbacks(this, name, block); }
    /**
     * @template [T=true]
     * @param {string} name
     * @param {() => T | Promise<T>} [block]
     * @returns {Promise<T | false>}
     */
    runCallbacksAsync(name, block) { return runCallbacksAsync(this, name, block); }
  };
