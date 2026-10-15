// Port of ActiveSupport::OrderedOptions and InheritableOptions.
//
//   const h = new OrderedOptions()
//   h.boy = "John"
//   h.boy            // => "John"
//   h.dogBang()      // throws KeyError: :dog is blank (Ruby's h.dog!)
//
// Plain property access already works on JS objects; the class exists for the
// bang accessors, fetch/dig, and parent fallback in InheritableOptions.
export class KeyError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = "KeyError";
  }
}

/**
 * An options object with arbitrary keys. Keys are set dynamically, so the
 * class types alone don't expose them; this alias adds the index signature.
 * @typedef {OrderedOptions & { [key: string]: any }} Options
 */

const PARENT = Symbol("activejs.options.parent");

/**
 * @param {any} target
 * @param {PropertyKey} key
 * @returns {unknown}
 */
function lookup(target, key) {
  if (Object.hasOwn(target, key)) return target[key];
  const parent = target[PARENT];
  return parent == null ? undefined : parent[key];
}

/** @type {ProxyHandler<any>} */
const handler = {
  get(target, prop, receiver) {
    if (typeof prop !== "string" || prop in target) return Reflect.get(target, prop, receiver);
    if (prop.endsWith("Bang")) {
      const key = prop.slice(0, -4);
      return () => {
        const value = lookup(target, key);
        if (value === undefined || value === null || value === "") throw new KeyError(`:${key} is blank`);
        return value;
      };
    }
    return lookup(target, prop);
  },
  has(target, prop) {
    return prop in target || (target[PARENT] != null && prop in Object(target[PARENT]));
  },
};

export class OrderedOptions {
  /** @param {Record<string, unknown>} [values] */
  constructor(values = {}) {
    Object.assign(this, values);
    return new Proxy(this, handler);
  }

  /**
   * @param {string} key
   * @param {...unknown} fallback A default value, or a function called with the key.
   * @returns {any}
   */
  fetch(key, ...fallback) {
    const value = lookup(this, key);
    if (value !== undefined) return value;
    if (typeof fallback[0] === "function") return fallback[0](key);
    if (fallback.length) return fallback[0];
    throw new KeyError(`key not found: ${JSON.stringify(key)}`);
  }

  /**
   * @param {...PropertyKey} keys
   * @returns {any}
   */
  dig(...keys) {
    return keys.reduce((/** @type {any} */ obj, k) => (obj == null ? undefined : obj[k]), this);
  }

  /** @returns {Record<string, any>} */
  toObject() {
    const parent = this[PARENT];
    const inherited = parent == null ? {} : typeof parent.toObject === "function" ? parent.toObject() : { ...parent };
    return { ...inherited, ...this };
  }

  /** @returns {Record<string, any>} */
  toJSON() {
    return this.toObject();
  }
}

// Falls back to a parent object for keys it doesn't define itself.
//   const h = new InheritableOptions({ girl: "Mary" })
//   h.girl // => "Mary"
export class InheritableOptions extends OrderedOptions {
  /** @param {object} [parent] */
  constructor(parent = {}) {
    super();
    Object.defineProperty(this, PARENT, { value: parent, enumerable: false });
  }

  /** @returns {InheritableOptions & Options} */
  inheritableCopy() {
    return new InheritableOptions(this);
  }
}
