// Port of active_support/core_ext/array and core_ext/enumerable.
import { isBlank, isPlainObject } from "./object.js";

// ---- Array -----------------------------------------------------------------

/**
 * wrap(null) // => []; wrap([1, 2]) // => [1, 2]; wrap(0) // => [0]
 * @template T
 * @param {T | T[] | null | undefined} value
 * @returns {T[]}
 */
export function wrap(value) {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) return value;
  return [value];
}

/**
 * toSentence(["one", "two", "three"]) // => "one, two, and three"
 * @param {readonly unknown[]} array
 * @param {{ wordsConnector?: string, twoWordsConnector?: string, lastWordConnector?: string }} [options]
 * @returns {string}
 */
export function toSentence(
  array,
  { wordsConnector = ", ", twoWordsConnector = " and ", lastWordConnector = ", and " } = {},
) {
  switch (array.length) {
    case 0: return "";
    case 1: return String(array[0]);
    case 2: return `${array[0]}${twoWordsConnector}${array[1]}`;
    default:
      return `${array.slice(0, -1).join(wordsConnector)}${lastWordConnector}${array.at(-1)}`;
  }
}

/**
 * inGroupsOf([1..7], 3) // => [[1,2,3],[4,5,6],[7,null,null]]
 * Pass fillWith = false to skip padding.
 * @template T
 * @template [F=null]
 * @param {readonly T[]} array
 * @param {number} number
 * @param {F | false} [fillWith]
 * @returns {Array<Array<T | F>>}
 */
export function inGroupsOf(array, number, fillWith = null) {
  if (!Number.isInteger(number) || number <= 0) {
    throw new RangeError(`Group size must be a positive integer, was ${number}`);
  }
  /** @type {readonly (T | F)[]} */
  let collection = array;
  if (fillWith !== false) {
    const padding = (number - (array.length % number)) % number;
    collection = [...array, ...Array(padding).fill(fillWith)];
  }
  /** @type {Array<Array<T | F>>} */
  const groups = [];
  for (let i = 0; i < collection.length; i += number) groups.push(collection.slice(i, i + number));
  return groups;
}

/**
 * inGroups([1..10], 3) // => [[1,2,3,4],[5,6,7,null],[8,9,10,null]]
 * @template T
 * @template [F=null]
 * @param {readonly T[]} array
 * @param {number} number
 * @param {F | false} [fillWith]
 * @returns {Array<Array<T | F>>}
 */
export function inGroups(array, number, fillWith = null) {
  const division = Math.floor(array.length / number);
  const modulo = array.length % number;
  /** @type {Array<Array<T | F>>} */
  const groups = [];
  let start = 0;
  for (let index = 0; index < number; index++) {
    const length = division + (modulo > 0 && modulo > index ? 1 : 0);
    /** @type {Array<T | F>} */
    const group = array.slice(start, start + length);
    if (fillWith !== false && modulo > 0 && length === division) group.push(fillWith);
    groups.push(group);
    start += length;
  }
  return groups;
}

/**
 * splitBy([1, 2, 3, 4, 5], 3) // => [[1, 2], [4, 5]]
 * splitBy([1..10], (i) => i % 3 === 0) // => [[1, 2], [4, 5], [7, 8], [10]]
 * @template T
 * @param {Iterable<T>} array
 * @param {T | ((item: T) => unknown)} valueOrFn
 * @returns {T[][]}
 */
export function splitBy(array, valueOrFn) {
  const matches = typeof valueOrFn === "function"
    ? /** @type {(item: T) => unknown} */ (valueOrFn)
    : (/** @type {T} */ x) => x === valueOrFn;
  /** @type {T[][]} */
  const result = [[]];
  for (const item of array) {
    if (matches(item)) result.push([]);
    else result.at(-1).push(item);
  }
  return result;
}

/**
 * Removes and returns a trailing options object, like Ruby's extract_options!.
 * @param {unknown[]} args
 * @returns {Record<PropertyKey, unknown>}
 */
export function extractOptions(args) {
  return isPlainObject(args.at(-1)) ? /** @type {Record<PropertyKey, unknown>} */ (args.pop()) : {};
}

/**
 * @template T
 * @param {readonly T[]} a
 * @returns {T | undefined}
 */
export const second = (a) => a[1];
/**
 * @template T
 * @param {readonly T[]} a
 * @returns {T | undefined}
 */
export const third = (a) => a[2];
/**
 * @template T
 * @param {readonly T[]} a
 * @returns {T | undefined}
 */
export const fourth = (a) => a[3];
/**
 * @template T
 * @param {readonly T[]} a
 * @returns {T | undefined}
 */
export const fifth = (a) => a[4];
/**
 * @template T
 * @param {readonly T[]} a
 * @returns {T | undefined}
 */
export const fortyTwo = (a) => a[41];
/**
 * @template T
 * @param {readonly T[]} a
 * @returns {T | undefined}
 */
export const secondToLast = (a) => a.at(-2);
/**
 * @template T
 * @param {readonly T[]} a
 * @returns {T | undefined}
 */
export const thirdToLast = (a) => a.at(-3);

/**
 * from([a, b, c, d], 2) // => [c, d]
 * @template T
 * @param {readonly T[]} a
 * @param {number} position
 * @returns {T[]}
 */
export const from = (a, position) => a.slice(position < 0 ? Math.max(0, a.length + position) : position);
/**
 * to([a, b, c, d], 2) // => [a, b, c]
 * @template T
 * @param {readonly T[]} a
 * @param {number} position
 * @returns {T[]}
 */
export function to(a, position) {
  const pos = position < 0 ? a.length + position : position;
  return pos < 0 ? [] : a.slice(0, pos + 1);
}

// ---- Enumerable ------------------------------------------------------------

/**
 * A key name or a function extracting a value from each item.
 * @template T
 * @typedef {keyof T | ((item: T) => any)} KeyOrFn
 */

/**
 * @template T
 * @param {Iterable<T>} enumerable
 * @returns {T[]}
 */
const toArray = (enumerable) =>
  Array.isArray(enumerable)
    ? enumerable
    : /** @type {T[]} */ ([...(isPlainObject(enumerable) ? Object.entries(enumerable) : enumerable)]);

/**
 * @template T
 * @param {KeyOrFn<T>} key
 * @returns {(item: T) => any}
 */
const keyFn = (key) => (typeof key === "function" ? key : (x) => /** @type {any} */ (x)?.[key]);

/**
 * excluding([1, 2, 3], 2) // => [1, 3]
 * @template T
 * @param {Iterable<T>} enumerable
 * @param {...(T | T[])} elements
 * @returns {T[]}
 */
export function excluding(enumerable, ...elements) {
  const remove = new Set(elements.flat());
  return toArray(enumerable).filter((x) => !remove.has(x));
}
export const without = excluding;

/**
 * including([1, 2], [3, 4], 5) // => [1, 2, 3, 4, 5]
 * @template T
 * @param {Iterable<T>} enumerable
 * @param {...(T | T[])} elements
 * @returns {T[]}
 */
export const including = (enumerable, ...elements) => [...toArray(enumerable), .../** @type {T[]} */ (elements.flat())];

/**
 * indexBy(people, "login") // => { "nextangle" => <Person ...>, ... }
 * @template T
 * @param {Iterable<T>} enumerable
 * @param {KeyOrFn<T>} key
 * @returns {Record<string, T>}
 */
export function indexBy(enumerable, key) {
  const fn = keyFn(key);
  /** @type {Record<string, T>} */
  const out = {};
  for (const item of toArray(enumerable)) out[fn(item)] = item;
  return out;
}

/**
 * indexWith(["title", "body"], (attr) => post[attr]) // => { title: ..., body: ... }
 * indexWith(["title", "body"], "") // => { title: "", body: "" }
 * @template {PropertyKey} K
 * @template V
 * @param {Iterable<K>} enumerable
 * @param {V | ((item: K) => V)} valueOrFn
 * @returns {Record<K, V>}
 */
export function indexWith(enumerable, valueOrFn) {
  const out = /** @type {Record<K, V>} */ ({});
  for (const item of toArray(enumerable)) {
    out[item] = typeof valueOrFn === "function" ? /** @type {(item: K) => V} */ (valueOrFn)(item) : valueOrFn;
  }
  return out;
}

/**
 * many([1]) // => false; many(people, (p) => p.age > 26)
 * @template T
 * @param {Iterable<T>} enumerable
 * @param {(item: T) => unknown} [predicate]
 * @returns {boolean}
 */
export function many(enumerable, predicate) {
  let count = 0;
  for (const item of toArray(enumerable)) {
    if (!predicate || predicate(item)) count++;
    if (count > 1) return true;
  }
  return false;
}

/**
 * pluck([{ name: "David" }, { name: "Rafael" }], "name") // => ["David", "Rafael"]
 * pluck(people, "id", "name") // => [[1, "David"], [2, "Rafael"]]
 * @template T
 * @template {keyof T} K
 * @overload
 * @param {Iterable<T>} enumerable
 * @param {K} key
 * @returns {Array<T[K]>}
 */
/**
 * @template T
 * @overload
 * @param {Iterable<T>} enumerable
 * @param {keyof T} key1
 * @param {keyof T} key2
 * @param {...(keyof T)} keys
 * @returns {unknown[][]}
 */
/**
 * @param {Iterable<any>} enumerable
 * @param {...PropertyKey} keys
 * @returns {any}
 */
export function pluck(enumerable, ...keys) {
  const items = toArray(enumerable);
  return keys.length > 1 ? items.map((x) => keys.map((k) => x?.[k])) : items.map((x) => x?.[keys[0]]);
}

/**
 * pick(people, "name") // => "David" (from the first element)
 * @template T
 * @template {keyof T} K
 * @overload
 * @param {Iterable<T>} enumerable
 * @param {K} key
 * @returns {T[K] | undefined}
 */
/**
 * @template T
 * @overload
 * @param {Iterable<T>} enumerable
 * @param {keyof T} key1
 * @param {keyof T} key2
 * @param {...(keyof T)} keys
 * @returns {unknown[] | undefined}
 */
/**
 * @param {Iterable<any>} enumerable
 * @param {...PropertyKey} keys
 * @returns {any}
 */
export function pick(enumerable, ...keys) {
  const [firstItem] = toArray(enumerable);
  if (firstItem === undefined) return undefined;
  return keys.length > 1 ? keys.map((k) => firstItem?.[k]) : firstItem?.[keys[0]];
}

/**
 * sum([1, 2, 3]) // => 6; sum(payments, (p) => p.price)
 * sum(["foo", "bar"], undefined, "") // => "foobar"
 * Values with a plus() method (such as Durations) are added with it.
 * Without an identity the first value starts the total, like Ruby's
 * inject(:+), so sum([days(1), hours(1)]) is a Duration; an empty input sums to 0.
 * @template T
 * @param {Iterable<T>} enumerable
 * @param {(item: T) => any} [fn]
 * @param {any} [identity]
 * @returns {any}
 */
export function sum(enumerable, fn, identity) {
  /** @type {any} */
  let total = identity;
  let started = identity !== undefined;
  for (const item of toArray(enumerable)) {
    const value = fn ? fn(item) : item;
    if (!started) {
      total = value;
      started = true;
      continue;
    }
    total = total !== null && typeof total?.plus === "function" ? total.plus(value) : total + value;
  }
  return started ? total : 0;
}

/**
 * minimum(payments, "price") // => 5
 * @template T
 * @param {Iterable<T>} enumerable
 * @param {KeyOrFn<T>} key
 * @returns {any}
 */
export function minimum(enumerable, key) {
  const values = toArray(enumerable).map(keyFn(key));
  return values.length ? values.reduce((a, b) => (b < a ? b : a)) : undefined;
}

/**
 * @template T
 * @param {Iterable<T>} enumerable
 * @param {KeyOrFn<T>} key
 * @returns {any}
 */
export function maximum(enumerable, key) {
  const values = toArray(enumerable).map(keyFn(key));
  return values.length ? values.reduce((a, b) => (b > a ? b : a)) : undefined;
}

/**
 * compactBlank([1, "", null, 2, " ", [], {}, false, true]) // => [1, 2, true]
 * @template T
 * @overload
 * @param {Iterable<T>} enumerable
 * @returns {T[]}
 */
/**
 * @template {Record<PropertyKey, unknown>} O
 * @overload
 * @param {O} enumerable
 * @returns {Partial<O>}
 */
/**
 * @param {any} enumerable
 * @returns {any}
 */
export function compactBlank(enumerable) {
  if (isPlainObject(enumerable)) {
    return Object.fromEntries(Object.entries(enumerable).filter(([, v]) => !isBlank(v)));
  }
  return toArray(enumerable).filter((x) => !isBlank(x));
}

/**
 * inOrderOf([{ id: 2 }, { id: 3 }, { id: 1 }], "id", [3, 1, 2])
 * Items whose key isn't in the series are dropped unless filter is false.
 * @template T
 * @param {Iterable<T>} enumerable
 * @param {KeyOrFn<T>} key
 * @param {readonly unknown[]} series
 * @param {{ filter?: boolean }} [options]
 * @returns {T[]}
 */
export function inOrderOf(enumerable, key, series, { filter = true } = {}) {
  const fn = keyFn(key);
  const position = new Map(series.map((v, i) => [v, i]));
  const items = toArray(enumerable);
  const kept = filter ? items.filter((x) => position.has(fn(x))) : items;
  return kept
    .map((x, i) => /** @type {[T, number]} */ ([x, i]))
    .sort(([a, ai], [b, bi]) => {
      const pa = position.get(fn(a)) ?? Infinity;
      const pb = position.get(fn(b)) ?? Infinity;
      return pa === pb ? ai - bi : pa - pb;
    })
    .map(([x]) => x);
}

export class SoleItemExpectedError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = "SoleItemExpectedError";
  }
}

/**
 * sole([1]) // => 1; sole([]) throws "no item found"; sole([1, 2]) throws "multiple items found"
 * @template T
 * @param {Iterable<T>} enumerable
 * @returns {T}
 */
export function sole(enumerable) {
  const items = toArray(enumerable);
  if (items.length === 0) throw new SoleItemExpectedError("no item found");
  if (items.length > 1) throw new SoleItemExpectedError("multiple items found");
  return items[0];
}
