// Port of ActiveSupport::Configurable.
//
//   class User extends Configurable() {
//     static {
//       this.configAccessor("allowedAccess", { default: false });
//     }
//   }
//   User.configure((config) => { config.allowedAccess = true })
//   User.allowedAccess        // => true
//   new User().allowedAccess  // => true (instances read the class config)
//
// Subclasses inherit their parent's config and can override it without
// affecting the parent; instances get their own overridable copy.
import { InheritableOptions } from "./ordered_options.js";

/** @typedef {import("./ordered_options.js").Options} Options */

/**
 * @typedef {object} ConfigAccessorOptions
 * @property {unknown} [default] A value, or a function whose result becomes the value.
 * @property {boolean} [instanceReader]
 * @property {boolean} [instanceWriter]
 * @property {boolean} [instanceAccessor]
 */

const CONFIG = Symbol("activejs.configurable.config");
const INSTANCE_CONFIG = Symbol("activejs.configurable.instanceConfig");

/**
 * @param {Function} klass
 * @returns {InheritableOptions & Options}
 */
export function classConfig(klass) {
  if (!Object.hasOwn(klass, CONFIG)) {
    const parent = Object.getPrototypeOf(klass);
    const parentConfig = parent && parent[CONFIG] !== undefined ? classConfig(parent) : {};
    Object.defineProperty(klass, CONFIG, { value: new InheritableOptions(parentConfig), enumerable: false });
  }
  return klass[CONFIG];
}

/**
 * @param {Function} klass
 * @param {...(string | ConfigAccessorOptions)} rawArgs Names, optionally followed by options.
 * @returns {void}
 */
export function configAccessor(klass, ...rawArgs) {
  const args = /** @type {any[]} */ (rawArgs);
  /** @type {ConfigAccessorOptions} */
  const options = typeof args.at(-1) === "object" && args.at(-1) !== null ? args.pop() : {};
  const { instanceReader = true, instanceWriter = true, instanceAccessor = true } = options;
  for (const name of args) {
    if (!/^[_A-Za-z]\w*$/.test(name)) throw new TypeError(`invalid config attribute name: ${name}`);
    Object.defineProperty(klass, name, {
      get() { return classConfig(this)[name]; },
      /** @param {unknown} v */
      set(v) { classConfig(this)[name] = v; },
      configurable: true,
    });
    if (instanceAccessor) {
      /** @type {PropertyDescriptor} */
      const descriptor = { configurable: true };
      if (instanceReader) descriptor.get = function () { return instanceConfig(this)[name]; };
      if (instanceWriter) descriptor.set = function (/** @type {unknown} */ v) { instanceConfig(this)[name] = v; };
      Object.defineProperty(klass.prototype, name, descriptor);
    }
    if ("default" in options) {
      classConfig(klass)[name] = typeof options.default === "function" ? options.default() : options.default;
    }
  }
}

/**
 * @param {object} instance
 * @returns {InheritableOptions & Options}
 */
export function instanceConfig(instance) {
  if (!Object.hasOwn(instance, INSTANCE_CONFIG)) {
    Object.defineProperty(instance, INSTANCE_CONFIG, {
      value: new InheritableOptions(classConfig(instance.constructor)),
      enumerable: false,
    });
  }
  return instance[INSTANCE_CONFIG];
}

/**
 * @template {new (...args: any[]) => {}} [TBase=new (...args: any[]) => {}]
 * @param {TBase} [Base]
 */
export const Configurable = (Base = /** @type {TBase} */ (/** @type {unknown} */ (Object))) =>
  class extends Base {
    /** @returns {InheritableOptions & Options} */
    static get config() { return classConfig(this); }
    /**
     * @param {(config: InheritableOptions & Options) => void} fn
     * @returns {InheritableOptions & Options}
     */
    static configure(fn) { fn(classConfig(this)); return classConfig(this); }
    /**
     * @param {...(string | ConfigAccessorOptions)} args
     * @returns {void}
     */
    static configAccessor(...args) { configAccessor(this, ...args); }
    /** @returns {InheritableOptions & Options} */
    get config() { return instanceConfig(this); }
  };
