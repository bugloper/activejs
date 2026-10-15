// Ports of Class#class_attribute, Module#mattr_accessor / cattr_accessor,
// Module#delegate, Module#delegate_missing_to and Module#alias_attribute.
//
// Accessors are defined at runtime, so TypeScript doesn't see them on the
// class; declare them on the class to type them.

/**
 * @typedef {object} ClassAttributeOptions
 * @property {unknown} [default]
 * @property {boolean} [instanceAccessor]
 * @property {boolean} [instanceReader]
 * @property {boolean} [instanceWriter]
 * @property {boolean} [instancePredicate]
 */

/**
 * @typedef {object} MattrAccessorOptions
 * @property {unknown} [default]
 * @property {boolean} [instanceAccessor]
 * @property {boolean} [instanceReader]
 * @property {boolean} [instanceWriter]
 */

/**
 * @typedef {object} DelegateOptions
 * @property {string | ((this: any) => unknown)} to The property holding the target, or a function returning it.
 * @property {boolean | string} [prefix]
 * @property {boolean} [allowNil]
 */

/**
 * classAttribute(Base, "setting", { default: [] })
 * Subclasses inherit the value but can override it without affecting the
 * parent. Instances read the class value and may override it per instance.
 * @param {Function} klass
 * @param {...(string | ClassAttributeOptions)} args Names, optionally followed by options.
 * @returns {void}
 */
export function classAttribute(klass, ...args) {
  const names = /** @type {any[]} */ (args);
  /** @type {ClassAttributeOptions} */
  const options = typeof names.at(-1) === "object" && names.at(-1) !== null ? names.pop() : {};
  const {
    instanceAccessor = true,
    instanceReader = instanceAccessor,
    instanceWriter = instanceAccessor,
    instancePredicate = true,
  } = options;
  for (const name of names) {
    const storage = Symbol(`classAttribute:${name}`);
    Object.defineProperty(klass, storage, { value: options.default, writable: true, configurable: true });
    Object.defineProperty(klass, name, {
      get() { return this[storage]; },
      /** @param {unknown} v */
      set(v) { Object.defineProperty(this, storage, { value: v, writable: true, configurable: true }); },
      configurable: true,
    });
    const capitalized = name[0].toUpperCase() + name.slice(1);
    if (instancePredicate) {
      Object.defineProperty(klass, `is${capitalized}`, { value() { return Boolean(this[name]); }, configurable: true, writable: true });
    }
    const instanceStorage = Symbol(`classAttribute:${name}:instance`);
    if (instanceReader || instanceWriter) {
      /** @type {PropertyDescriptor} */
      const descriptor = { configurable: true };
      if (instanceReader) {
        descriptor.get = function () {
          return Object.hasOwn(this, instanceStorage) ? this[instanceStorage] : this.constructor[name];
        };
      }
      if (instanceWriter) {
        descriptor.set = function (/** @type {unknown} */ v) {
          Object.defineProperty(this, instanceStorage, { value: v, writable: true, configurable: true });
        };
      }
      Object.defineProperty(klass.prototype, name, descriptor);
      if (instanceReader && instancePredicate) {
        Object.defineProperty(klass.prototype, `is${capitalized}`, {
          value() { return Boolean(this[name]); }, configurable: true, writable: true,
        });
      }
    }
  }
}

/**
 * mattrAccessor(Base, "logger", { default: console })
 * One value shared by the class, all subclasses and instances (Ruby's `@@var`).
 * @param {Function} klass
 * @param {...(string | MattrAccessorOptions)} args Names, optionally followed by options.
 * @returns {void}
 */
export function mattrAccessor(klass, ...args) {
  const names = /** @type {any[]} */ (args);
  /** @type {MattrAccessorOptions} */
  const options = typeof names.at(-1) === "object" && names.at(-1) !== null ? names.pop() : {};
  const { instanceReader = true, instanceWriter = true, instanceAccessor = true } = options;
  for (const name of names) {
    let value = options.default;
    Object.defineProperty(klass, name, { get: () => value, set: (/** @type {unknown} */ v) => { value = v; }, configurable: true });
    if (instanceAccessor) {
      /** @type {PropertyDescriptor} */
      const descriptor = { configurable: true };
      if (instanceReader) descriptor.get = () => value;
      if (instanceWriter) descriptor.set = (/** @type {unknown} */ v) => { value = v; };
      Object.defineProperty(klass.prototype, name, descriptor);
    }
  }
}
export const cattrAccessor = mattrAccessor;

export class DelegationError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = "DelegationError";
  }
}

/**
 * delegate(Post, "name", "email", { to: "author", prefix: true, allowNil: true })
 * defines post.authorName() -> this.author.name (calling it if it's a method).
 * @param {Function} klass
 * @param {...(string | DelegateOptions)} args Method names followed by the options.
 * @returns {string[]} The names of the defined methods.
 */
export function delegate(klass, ...args) {
  const methods = /** @type {any[]} */ (args);
  /** @type {DelegateOptions} */
  const options = methods.pop();
  if (!options || typeof options !== "object" || !options.to) {
    throw new TypeError("Delegation needs a target. Supply a keyword argument 'to' (e.g. delegate(K, 'hello', { to: 'greeter' })).");
  }
  const { to, prefix, allowNil = false } = options;
  if (prefix === true && typeof to !== "string") {
    throw new TypeError("delegate needs an explicit prefix string when 'to' is a function");
  }
  const prefixText = prefix === true ? `${to}` : prefix ? `${prefix}` : "";
  const defined = [];
  for (const method of methods) {
    const name = prefixText ? `${prefixText}${method[0].toUpperCase()}${method.slice(1)}` : method;
    /** @this {any} */
    const resolveTarget = function () {
      const target = typeof to === "function" ? to.call(this) : this[to];
      if (target === null || target === undefined) {
        if (allowNil) return undefined;
        throw new DelegationError(`${klass.name}#${name} delegated to ${String(to)}.${method}, but ${String(to)} is ${target}`);
      }
      return target;
    };
    Object.defineProperty(klass.prototype, name, {
      /** @param {...unknown} callArgs */
      value: function (...callArgs) {
        const target = resolveTarget.call(this);
        if (target === undefined) return undefined;
        const member = target[method];
        return typeof member === "function" ? member.apply(target, callArgs) : member;
      },
      writable: true, configurable: true,
    });
    defined.push(name);
  }
  return defined;
}

/**
 * Forwards any property the instance doesn't have to this[target].
 *   delegateMissingTo(Partition, "records")
 * @param {Function} klass
 * @param {string} target
 * @param {{ allowNil?: boolean }} [options]
 * @returns {void}
 */
export function delegateMissingTo(klass, target, { allowNil = false } = {}) {
  const originalProto = Object.getPrototypeOf(klass.prototype);
  const proxy = new Proxy(originalProto ?? Object.prototype, {
    get(t, prop, receiver) {
      if (prop in t || typeof prop === "symbol" || prop === target) return Reflect.get(t, prop, receiver);
      const delegateTo = receiver[target];
      if (delegateTo === null || delegateTo === undefined) {
        if (allowNil) return undefined;
        throw new DelegationError(`${String(prop)} delegated to ${target}, but ${target} is ${delegateTo}`);
      }
      if (!(prop in Object(delegateTo))) return undefined;
      const member = delegateTo[prop];
      return typeof member === "function" ? member.bind(delegateTo) : member;
    },
  });
  Object.setPrototypeOf(klass.prototype, proxy);
}

/**
 * aliasAttribute(Content, "subject", "title") — subject reads/writes title.
 * @param {Function} klass
 * @param {string} newName
 * @param {string} oldName
 * @returns {void}
 */
export function aliasAttribute(klass, newName, oldName) {
  Object.defineProperty(klass.prototype, newName, {
    get() { return this[oldName]; },
    /** @param {unknown} v */
    set(v) { this[oldName] = v; },
    configurable: true,
  });
}
