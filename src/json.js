// Port of ActiveSupport::JSON and Object#as_json.
//
//   encode({ at: new Date(), tags: new Set(["a"]), price: 9.99 })
//   // => '{"at":"2024-01-31T15:30:45.123+06:00","tags":["a"],"price":9.99}'
//
// Like Rails: Dates encode as ISO 8601 with millisecond precision and the
// local offset, Maps/Sets become objects/arrays, anything with asJson() or
// toJSON() controls its own representation, and "<", ">", "&", U+2028 and
// U+2029 are escaped so the output is safe inside <script> tags.
import { iso8601 } from "./core_ext/date.js";

/**
 * @typedef {null | boolean | number | string | unknown[] | JsonObject} JsonValue
 */
/** @typedef {Record<string, unknown>} JsonObject */
/**
 * @typedef {object} AsJsonOptions
 * @property {string | string[]} [only]
 * @property {string | string[]} [except]
 */

export const Encoding = {
  escapeHtmlEntitiesInJson: true,
  useStandardJsonTimeFormat: true,
  timePrecision: 3,
};

/**
 * @param {unknown} value
 * @param {AsJsonOptions} [options]
 * @returns {JsonValue | undefined}
 */
export function asJson(value, options = {}) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "symbol") return value.description ?? null;
  if (typeof value === "function") return undefined;
  const obj = /** @type {any} */ (value);
  if (typeof obj.asJson === "function") return asJson(obj.asJson(options), options);
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return Encoding.useStandardJsonTimeFormat
      ? iso8601(value, Encoding.timePrecision)
      : value.toString();
  }
  if (value instanceof String || value instanceof Number || value instanceof Boolean) return value.valueOf();
  if (Array.isArray(value) || value instanceof Set) return [...value].map((v) => asJson(v, options) ?? null);
  if (value instanceof Map) return asJson(Object.fromEntries(value), options);
  if (value instanceof RegExp) return value.toString();
  if (value instanceof Error) return { name: value.name, message: value.message };
  if (typeof obj.toJSON === "function") return asJson(obj.toJSON(), options);

  let entries = Object.entries(value);
  if (options.only) entries = entries.filter(([k]) => [].concat(options.only).includes(k));
  if (options.except) entries = entries.filter(([k]) => ![].concat(options.except).includes(k));
  /** @type {JsonObject} */
  const out = {};
  for (const [k, v] of entries) {
    const json = asJson(v, {});
    if (json !== undefined) out[k] = json;
  }
  return out;
}

/** @type {Record<string, string>} */
const ESCAPED = { "<": "\\u003c", ">": "\\u003e", "&": "\\u0026" };

/**
 * @param {unknown} value
 * @param {AsJsonOptions & { pretty?: boolean }} [options]
 * @returns {string}
 */
export function encode(value, options = {}) {
  const json = JSON.stringify(asJson(value, options), null, options.pretty ? 2 : undefined) ?? "null";
  const escaped = json.replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
  return Encoding.escapeHtmlEntitiesInJson ? escaped.replace(/[<>&]/g, (c) => ESCAPED[c]) : escaped;
}
export const dump = encode;

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_REGEX = /^\d{4}-\d{2}-\d{2}(?:T|\s)\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?$/;

/**
 * decode('{"a":1}') // => { a: 1 }
 * With { parseJsonTimes: true }, ISO 8601 strings become Dates.
 * @param {string} json
 * @param {{ parseJsonTimes?: boolean }} [options]
 * @returns {any}
 */
export function decode(json, { parseJsonTimes = false } = {}) {
  return JSON.parse(json, parseJsonTimes
    ? (_k, v) => (typeof v === "string" && (DATETIME_REGEX.test(v) || DATE_REGEX.test(v)) ? parseTime(v) : v)
    : undefined);
}
export const load = decode;

/**
 * @param {string} v
 * @returns {Date | string}
 */
function parseTime(v) {
  if (DATE_REGEX.test(v)) {
    const [y, m, d] = v.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  const d = new Date(v.replace(" ", "T"));
  return Number.isNaN(d.getTime()) ? v : d;
}

export const ActiveSupportJSON = { encode, decode, dump, load, asJson, Encoding };
