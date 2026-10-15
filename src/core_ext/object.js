// Port of active_support/core_ext/object: blank?, present?, presence, try,
// in?, presence_in, deep_dup, duplicable?, with_options, to_query/to_param.

/**
 * @param {unknown} value
 * @returns {value is Record<PropertyKey, unknown>}
 */
export const isPlainObject = (value) => {
  if (value === null || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

// Marks functions installed by @bugloper/activejs/core_ext. Hooks such as isBlank(),
// deepDup(), toParam() and asJson() let objects customise behaviour, but once
// the prototypes are patched every string/array/date "has" those methods; a
// hook that is really the extension would just call back in and recurse.
export const CORE_EXT = Symbol.for("activejs.coreExt");

/**
 * Returns value[name] if it is a function the value really provides, and
 * undefined for core_ext prototype extensions.
 * @param {unknown} value
 * @param {string} name
 * @returns {Function | undefined}
 */
export function ownHook(value, name) {
  if (value === null || value === undefined) return undefined;
  const fn = /** @type {any} */ (value)[name];
  return typeof fn === "function" && !fn[CORE_EXT] ? fn : undefined;
}

/**
 * An object is blank if it's false, empty, or a whitespace string.
 * null, undefined, false, "", "  ", [], {}, new Map(), new Set() are blank.
 * Numbers (including 0) and true are never blank, matching Ruby.
 * @param {unknown} value
 * @returns {boolean}
 */
export function isBlank(value) {
  if (value === null || value === undefined || value === false) return true;
  if (typeof value === "string") return /^\s*$/.test(value); // \s covers Unicode spaces, like [[:space:]]
  if (typeof value !== "object" && typeof value !== "function") return false;
  if (value instanceof String) return /^\s*$/.test(value.valueOf());
  if (Array.isArray(value)) return value.length === 0;
  if (value instanceof Map || value instanceof Set) return value.size === 0;
  const custom = ownHook(value, "isBlank");
  if (custom) return custom.call(value);
  if (isPlainObject(value)) return Object.keys(value).length === 0;
  return false;
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
export const isPresent = (value) => !isBlank(value);

/**
 * Returns the value if it's present, otherwise undefined.
 *   const state = presence(params.state) ?? "default"
 * @template T
 * @param {T} value
 * @returns {T | undefined}
 */
export const presence = (value) => (isPresent(value) ? value : undefined);

/**
 * Invokes the method named by the first argument when the receiver is not
 * null/undefined and responds to it; otherwise returns undefined.
 *   tryCall(user, "name")  tryCall(user, (u) => u.profile.name)
 * @template T
 * @param {T} receiver
 * @param {string | symbol | ((receiver: NonNullable<T>, ...args: any[]) => any)} method
 * @param {...any} args
 * @returns {any}
 */
export function tryCall(receiver, method, ...args) {
  if (receiver === null || receiver === undefined) return undefined;
  if (typeof method === "function") return method.call(receiver, receiver, ...args);
  const member = /** @type {any} */ (receiver)[method];
  if (member === undefined) return undefined;
  return typeof member === "function" ? member.apply(receiver, args) : member;
}

/**
 * Like tryCall but throws if the receiver doesn't respond to the method.
 * @template T
 * @param {T} receiver
 * @param {string | symbol | ((receiver: NonNullable<T>, ...args: any[]) => any)} method
 * @param {...any} args
 * @returns {any}
 */
export function tryBang(receiver, method, ...args) {
  if (receiver === null || receiver === undefined) return undefined;
  if (typeof method === "function") return method.call(receiver, receiver, ...args);
  const member = /** @type {any} */ (receiver)[method];
  if (typeof member !== "function") {
    throw new TypeError(`undefined method '${String(method)}' for ${receiver}`);
  }
  return member.apply(receiver, args);
}

/**
 * Anything isIn() can search: an array, string, Set, Map or plain object.
 * @typedef {{ includes(value: any): boolean } | { has(value: any): boolean } | Record<PropertyKey, unknown>} Collection
 */

/**
 * isIn(1, [1, 2, 3]) // => true
 * Accepts anything with includes(), has(), or a string.
 * @param {unknown} value
 * @param {Collection | string} collection
 * @returns {boolean}
 */
export function isIn(value, collection) {
  if (collection == null) throw new TypeError("The parameter passed to isIn must respond to includes or has");
  const c = /** @type {any} */ (collection);
  if (typeof c.includes === "function") return c.includes(value);
  if (typeof c.has === "function") return c.has(value);
  if (isPlainObject(collection)) return Object.hasOwn(collection, /** @type {PropertyKey} */ (value));
  throw new TypeError("The parameter passed to isIn must respond to includes or has");
}

/**
 * @template T
 * @param {T} value
 * @param {Collection | string} collection
 * @returns {T | undefined}
 */
export const presenceIn = (value, collection) => (isIn(value, collection) ? value : undefined);

/**
 * Returns a deep copy of the value. Arrays, plain objects, Maps, Sets and
 * Dates are copied recursively; anything with a deepDup() method uses it.
 * @template T
 * @param {T} value
 * @returns {T}
 */
export function deepDup(value) {
  if (value === null || typeof value !== "object") return value;
  const v = /** @type {any} */ (value);
  if (ownHook(v, "deepDup")) return v.deepDup();
  if (Array.isArray(v)) return /** @type {T} */ (v.map(deepDup));
  if (v instanceof Date) return /** @type {T} */ (new Date(v.getTime()));
  if (v instanceof Map) return /** @type {T} */ (new Map([...v].map(([k, x]) => [deepDup(k), deepDup(x)])));
  if (v instanceof Set) return /** @type {T} */ (new Set([...v].map(deepDup)));
  if (isPlainObject(v)) {
    const out = Object.create(Object.getPrototypeOf(v));
    for (const [k, x] of Object.entries(v)) out[k] = deepDup(x);
    return out;
  }
  return value;
}

/**
 * Converts a value to a URL parameter. Arrays join with "/", objects use toQuery.
 * @param {unknown} value
 * @returns {string | boolean | null | undefined}
 */
export function toParam(value) {
  if (value === null) return null;
  if (value === undefined) return undefined;
  if (value === true || value === false) return value;
  if (Array.isArray(value)) return value.map(toParam).join("/");
  if (isPlainObject(value)) return toQuery(value);
  const v = /** @type {any} */ (value);
  if (ownHook(v, "toParam")) return v.toParam();
  return String(value);
}

/**
 * toQuery({ name: "David", nationality: "Danish" }) // => "name=David&nationality=Danish"
 * toQuery({ a: [1, 2] }) // => "a%5B%5D=1&a%5B%5D=2"
 * toQuery("x", "y") // => "x=y"
 * @param {unknown} value
 * @param {string} [namespace]
 * @returns {string}
 */
export function toQuery(value, namespace) {
  if (Array.isArray(value)) {
    const prefix = `${namespace}[]`;
    if (value.length === 0) return toQuery(null, prefix);
    return value.map((v) => toQuery(v, prefix)).join("&");
  }
  if (isPlainObject(value)) {
    // Empty nested arrays/objects are skipped, as in Hash#to_query.
    const pairs = Object.entries(value)
      .filter(([, v]) => !((Array.isArray(v) || isPlainObject(v)) && isBlank(v)))
      .map(([k, v]) => toQuery(v, namespace ? `${namespace}[${k}]` : k));
    if (!String(namespace ?? "").includes("[]")) pairs.sort();
    return pairs.join("&");
  }
  const encoded = value === null || value === undefined ? "" : String(toParam(value));
  return `${cgiEscape(namespace)}=${cgiEscape(encoded)}`;
}

/**
 * Ruby's CGI.escape: spaces become "+", and everything outside
 * [a-zA-Z0-9_.~-] is percent-encoded.
 * @param {unknown} string
 * @returns {string}
 */
export function cgiEscape(string) {
  return encodeURIComponent(String(string))
    .replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/%20/g, "+");
}

/**
 * withOptions(model, { dependent: "destroy" }, (m) => {
 *   m.hasMany("customers")   // called as model.hasMany("customers", { dependent: "destroy" })
 * })
 * Returns a proxy where every method call on `target` gets `options` merged
 * into a trailing options object.
 * @template {object} T
 * @template [R=T]
 * @param {T} target
 * @param {Record<string, unknown>} options
 * @param {(proxy: T) => R} [fn]
 * @returns {R}
 */
export function withOptions(target, options, fn) {
  const proxy = /** @type {T} */ (new Proxy(/** @type {object} */ (target), {
    get(obj, prop, receiver) {
      const member = Reflect.get(obj, prop, receiver);
      if (typeof member !== "function") return member;
      return (/** @type {unknown[]} */ ...args) => {
        const last = args.at(-1);
        if (isPlainObject(last)) args[args.length - 1] = { ...options, ...last };
        else args.push({ ...options });
        return member.apply(obj, args);
      };
    },
  }));
  return fn ? fn(proxy) : /** @type {R} */ (/** @type {unknown} */ (proxy));
}
