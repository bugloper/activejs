// Port of active_support/core_ext/hash for plain JS objects.
import { isPlainObject, isBlank } from "./object.js";

/** @typedef {Record<PropertyKey, any>} Hash */

/**
 * deepMerge({ a: { b: 1 } }, { a: { c: 2 } }) // => { a: { b: 1, c: 2 } }
 * An optional resolver(key, thisVal, otherVal) decides conflicting leaves.
 * @template {Hash} A
 * @template {Hash} B
 * @param {A} target
 * @param {B} other
 * @param {(key: string, thisVal: any, otherVal: any) => any} [resolver]
 * @returns {A & B}
 */
export function deepMerge(target, other, resolver) {
  /** @type {Hash} */
  const out = { ...target };
  for (const [key, otherVal] of Object.entries(other)) {
    const thisVal = out[key];
    if (isPlainObject(thisVal) && isPlainObject(otherVal)) {
      out[key] = deepMerge(thisVal, otherVal, resolver);
    } else if (resolver && Object.hasOwn(out, key)) {
      out[key] = resolver(key, thisVal, otherVal);
    } else {
      out[key] = otherVal;
    }
  }
  return /** @type {A & B} */ (out);
}

/**
 * reverseMerge(options, { size: 25, velocity: 10 }) — defaults lose to options.
 * @template {Hash} A
 * @template {Hash} D
 * @param {A} target
 * @param {D} defaults
 * @returns {D & A}
 */
export const reverseMerge = (target, defaults) => ({ ...defaults, ...target });
export const withDefaults = reverseMerge;

/**
 * except({ a: 1, b: 2, c: 3 }, "b") // => { a: 1, c: 3 }
 * @template {Hash} H
 * @template {keyof H} K
 * @param {H} hash
 * @param {...(K | K[])} keys
 * @returns {Omit<H, K>}
 */
export function except(hash, ...keys) {
  const drop = new Set(keys.flat().map(String));
  return /** @type {Omit<H, K>} */ (Object.fromEntries(Object.entries(hash).filter(([k]) => !drop.has(k))));
}
export const without = except;

/**
 * slice({ a: 1, b: 2, c: 3 }, "a", "b") // => { a: 1, b: 2 }
 * @template {Hash} H
 * @template {keyof H} K
 * @param {H} hash
 * @param {...(K | K[])} keys
 * @returns {Partial<Pick<H, K>>}
 */
export function slice(hash, ...keys) {
  /** @type {Partial<Pick<H, K>>} */
  const out = {};
  for (const key of /** @type {K[]} */ (keys.flat())) if (Object.hasOwn(hash, key)) out[key] = hash[key];
  return out;
}

/**
 * Removes and returns the given keys from the object (mutating), like extract!.
 * @template {Hash} H
 * @template {keyof H} K
 * @param {H} hash
 * @param {...(K | K[])} keys
 * @returns {Partial<Pick<H, K>>}
 */
export function extract(hash, ...keys) {
  /** @type {Partial<Pick<H, K>>} */
  const out = {};
  for (const key of /** @type {K[]} */ (keys.flat())) {
    if (Object.hasOwn(hash, key)) {
      out[key] = hash[key];
      delete hash[key];
    }
  }
  return out;
}

/**
 * @template V
 * @param {Record<string, V>} hash
 * @param {(key: string) => PropertyKey} fn
 * @returns {Record<PropertyKey, V>}
 */
export function transformKeys(hash, fn) {
  return Object.fromEntries(Object.entries(hash).map(([k, v]) => [fn(k), v]));
}

/**
 * @template V
 * @template R
 * @param {Record<string, V>} hash
 * @param {(value: V) => R} fn
 * @returns {Record<string, R>}
 */
export function transformValues(hash, fn) {
  return Object.fromEntries(Object.entries(hash).map(([k, v]) => [k, fn(v)]));
}

/**
 * Transforms keys through nested objects and arrays.
 *   deepTransformKeys({ person: { first_name: "Rob" } }, camelize)
 * @param {unknown} value
 * @param {(key: string) => PropertyKey} fn
 * @returns {any}
 */
export function deepTransformKeys(value, fn) {
  if (Array.isArray(value)) return value.map((v) => deepTransformKeys(v, fn));
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [fn(k), deepTransformKeys(v, fn)]));
  }
  return value;
}

/**
 * @param {unknown} value
 * @param {(value: any) => unknown} fn
 * @returns {any}
 */
export function deepTransformValues(value, fn) {
  if (Array.isArray(value)) return value.map((v) => deepTransformValues(v, fn));
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, deepTransformValues(v, fn)]));
  }
  return fn(value);
}

/**
 * compact({ a: 1, b: null, c: undefined }) // => { a: 1 }
 * @template {Hash} H
 * @param {H} hash
 * @returns {Partial<H>}
 */
export function compact(hash) {
  return /** @type {Partial<H>} */ (Object.fromEntries(Object.entries(hash).filter(([, v]) => v !== null && v !== undefined)));
}

/**
 * @template {Hash} H
 * @param {H} hash
 * @returns {Partial<H>}
 */
export function compactBlank(hash) {
  return /** @type {Partial<H>} */ (Object.fromEntries(Object.entries(hash).filter(([, v]) => !isBlank(v))));
}

/**
 * assertValidKeys({ name: "Rob", years: "28" }, "name", "age")
 * // throws ArgumentError: Unknown key: "years". Valid keys are: "name", "age"
 * @param {Hash} hash
 * @param {...(PropertyKey | PropertyKey[])} validKeys
 * @returns {void}
 */
export function assertValidKeys(hash, ...validKeys) {
  const valid = validKeys.flat().map(String);
  for (const key of Object.keys(hash)) {
    if (!valid.includes(key)) {
      throw new TypeError(
        `Unknown key: ${JSON.stringify(key)}. Valid keys are: ${valid.map((k) => JSON.stringify(k)).join(", ")}`,
      );
    }
  }
}
