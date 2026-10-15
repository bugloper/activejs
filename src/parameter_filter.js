// Port of ActiveSupport::ParameterFilter.
//
//   const filter = new ParameterFilter(["password", /token/i, "credit_card.code"])
//   filter.filter({ password: "x", user: { api_token: "y" } })
//   // => { password: "[FILTERED]", user: { api_token: "[FILTERED]" } }
//
// String filters match keys partially and case-insensitively; dotted strings
// match the full nested key path. Function filters receive (key, value,
// originalParams) and return the replacement value.
import { isPlainObject } from "./core_ext/object.js";

/**
 * Receives (key, value, originalParams) and returns the replacement value,
 * or undefined to keep the value.
 * @typedef {(key: string, value: unknown, original?: unknown) => unknown} FilterBlock
 */

/** @typedef {string | symbol | RegExp | FilterBlock} ParameterFilterRule */

const FILTERED = "[FILTERED]";
/** @param {unknown} s */
const escapeRegExp = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export class ParameterFilter {
  /**
   * @param {ParameterFilterRule[]} [filters]
   * @param {{ mask?: unknown }} [options]
   */
  constructor(filters = [], { mask = FILTERED } = {}) {
    this.mask = mask;
    /** @type {FilterBlock[]} */
    this.blocks = /** @type {FilterBlock[]} */ (filters.filter((f) => typeof f === "function"));
    // Symbols filter by their description, like Ruby symbols filter by name.
    const strings = filters
      .filter((f) => typeof f === "string" || typeof f === "symbol")
      .map((f) => (typeof f === "symbol" ? f.description ?? "" : f))
      .filter((f) => f !== ""); // an empty alternative would match every key
    const regexps = /** @type {RegExp[]} */ (filters.filter((f) => f instanceof RegExp));
    const deep = strings.filter((s) => s.includes("."));
    const shallow = strings.filter((s) => !s.includes("."));
    // Regexps containing an escaped dot match the full nested path only.
    this.regexps = regexps.filter((r) => !r.source.includes("\\."));
    if (shallow.length) this.regexps.push(new RegExp(shallow.map(escapeRegExp).join("|"), "i"));
    this.deepRegexps = regexps.filter((r) => r.source.includes("\\."));
    if (deep.length) this.deepRegexps.push(new RegExp(deep.map(escapeRegExp).join("|"), "i"));
  }

  /**
   * Returns a filtered copy; the input is not modified.
   * @template T
   * @param {T} params
   * @returns {T}
   */
  filter(params) {
    return this.#call(params, []);
  }

  /**
   * Returns the masked value for a single key/value pair.
   * @param {unknown} key
   * @param {unknown} value
   * @returns {unknown}
   */
  filterParam(key, value) {
    if (this.#matches(String(key), String(key))) return this.mask;
    let v = value;
    for (const block of this.blocks) v = block(String(key), v) ?? v;
    return v;
  }

  /**
   * @param {string} key
   * @param {string} fullKey
   */
  #matches(key, fullKey) {
    /** @param {RegExp} re */
    const test = (re) => { re.lastIndex = 0; return re.test(key); };
    /** @param {RegExp} re */
    const testDeep = (re) => { re.lastIndex = 0; return re.test(fullKey); };
    return this.regexps.some(test) || this.deepRegexps.some(testDeep);
  }

  /**
   * @param {any} params
   * @param {string[]} parents
   * @param {unknown} [original]
   * @returns {any}
   */
  #call(params, parents, original = params) {
    if (!isPlainObject(params)) return params;
    /** @type {Record<string, unknown>} */
    const out = {};
    for (const [key, value] of Object.entries(params)) {
      const path = [...parents, key];
      out[key] = this.#valueFor(key, value, path, original);
    }
    return out;
  }

  /**
   * @param {string} key
   * @param {unknown} value
   * @param {string[]} path
   * @param {unknown} original
   * @returns {unknown}
   */
  #valueFor(key, value, path, original) {
    if (this.#matches(String(key), path.join("."))) return this.mask;
    if (isPlainObject(value)) return this.#call(value, path, original);
    if (Array.isArray(value)) {
      return value.map((v) => this.#valueFor(key, v, path, original));
    }
    let v = value;
    for (const block of this.blocks) {
      const replaced = block(String(key), v, original);
      if (replaced !== undefined) v = replaced;
    }
    return v;
  }
}
