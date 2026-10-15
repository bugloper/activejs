// Port of active_support/core_ext/string: access, filters, indent,
// strip_heredoc, inquiry, conversions.
import { StringInquirer } from "../string_inquirer.js";

/** @param {unknown} s */
const escapeRegExp = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * at("hello", 0) // => "h"; at("hello", -1) // => "o"; at("hello", /l+/) // => "ll"
 * @param {string} str
 * @param {number | string | RegExp | [number, number]} position
 * @returns {string | undefined}
 */
export function at(str, position) {
  if (position instanceof RegExp) return str.match(position)?.[0];
  if (typeof position === "string") return str.includes(position) ? position : undefined;
  if (Array.isArray(position)) {
    const [start, end] = position;
    return str.slice(start, end < 0 ? str.length + end + 1 : end + 1);
  }
  return str.at(position);
}

/**
 * from("hello", 2) // => "llo"; from("hello", -2) // => "lo"
 * @param {string} str
 * @param {number} position
 * @returns {string}
 */
export const from = (str, position) => str.slice(position < 0 ? Math.max(0, str.length + position) : position);

/**
 * to("hello", 2) // => "hel"; to("hello", -2) // => "hell"
 * @param {string} str
 * @param {number} position
 * @returns {string}
 */
export function to(str, position) {
  const pos = position < 0 ? str.length + position : position;
  return pos < 0 ? "" : str.slice(0, pos + 1);
}

/**
 * @param {string} str
 * @param {number} [limit]
 * @returns {string}
 */
export const first = (str, limit = 1) => str.slice(0, limit);

/**
 * @param {string} str
 * @param {number} [limit]
 * @returns {string}
 */
export const last = (str, limit = 1) => (limit === 0 ? "" : str.slice(-limit));

/**
 * squish("  foo   bar \n   \t   boo") // => "foo bar boo"
 * @param {string} str
 * @returns {string}
 */
export const squish = (str) => str.replace(/\s+/g, " ").trim();

/**
 * remove("foo bar test", " test", /bar/) // => "foo "
 * @param {string} str
 * @param {...(string | RegExp)} patterns
 * @returns {string}
 */
export function remove(str, ...patterns) {
  let out = str;
  for (const p of patterns) {
    const re = p instanceof RegExp
      ? new RegExp(p.source, p.flags.includes("g") ? p.flags : p.flags + "g")
      : new RegExp(escapeRegExp(p), "g");
    out = out.replace(re, "");
  }
  return out;
}

/**
 * truncate("Once upon a time in a world far far away", 27, { separator: " " })
 * // => "Once upon a time in a..."
 * @param {string} str
 * @param {number} truncateTo
 * @param {{ omission?: string, separator?: string | RegExp }} [options]
 * @returns {string}
 */
export function truncate(str, truncateTo, { omission = "...", separator = undefined } = {}) {
  if (str.length <= truncateTo) return str;
  const room = truncateTo - omission.length;
  let stop = room;
  if (separator !== undefined) {
    if (separator instanceof RegExp) {
      const re = new RegExp(separator.source, separator.flags.replace("g", "") + "g");
      let idx = -1;
      for (const m of str.matchAll(re)) {
        if (m.index <= room) idx = m.index;
        else break;
      }
      if (idx !== -1) stop = idx;
    } else {
      const idx = str.lastIndexOf(separator, room);
      if (idx !== -1) stop = idx;
    }
  }
  return str.slice(0, Math.max(0, stop)) + omission;
}

/**
 * truncateWords("Once upon a time in a world far far away", 4)
 * // => "Once upon a time..."
 * @param {string} str
 * @param {number} wordsCount
 * @param {{ omission?: string, separator?: string | RegExp }} [options]
 * @returns {string}
 */
export function truncateWords(str, wordsCount, { omission = "...", separator = /\s+/ } = {}) {
  const sep = separator instanceof RegExp ? separator.source : escapeRegExp(separator);
  const re = new RegExp(`^((?:[\\s\\S]+?${sep}){${wordsCount - 1}}[\\s\\S]+?)${sep}[\\s\\S]*`);
  const m = str.match(re);
  return m ? m[1] + omission : str;
}

/**
 * Truncates to a maximum byte size (UTF-8), never splitting a character.
 * @param {string} str
 * @param {number} truncateTo
 * @param {{ omission?: string }} [options]
 * @returns {string}
 */
export function truncateBytes(str, truncateTo, { omission = "…" } = {}) {
  const encoder = new TextEncoder();
  if (encoder.encode(str).length <= truncateTo) return str;
  const omissionBytes = encoder.encode(omission).length;
  if (omissionBytes > truncateTo) throw new RangeError(`Omission ${omission} is ${omissionBytes} bytes, larger than the truncation length of ${truncateTo} bytes`);
  const budget = truncateTo - omissionBytes;
  let out = "";
  let used = 0;
  for (const ch of str) {
    const n = encoder.encode(ch).length;
    if (used + n > budget) break;
    out += ch;
    used += n;
  }
  return out + omission;
}

/**
 * Strips leading indentation based on the least-indented non-blank line.
 * @param {string} str
 * @returns {string}
 */
export function stripHeredoc(str) {
  const indents = str.match(/^[ \t]*(?=\S)/gm) || [""];
  const min = indents.reduce((a, b) => (b.length < a.length ? b : a));
  return min ? str.replace(new RegExp(`^${min}`, "gm"), "") : str;
}

/**
 * indent("foo\n\nbar", 2) // => "  foo\n\n  bar"
 * @param {string} str
 * @param {number} amount
 * @param {string} [indentString]
 * @param {boolean} [indentEmptyLines]
 * @returns {string}
 */
export function indent(str, amount, indentString, indentEmptyLines = false) {
  const unit = indentString ?? str.match(/^[ \t]/m)?.[0] ?? " ";
  const re = indentEmptyLines ? /^/gm : /^(?!$)/gm;
  return str.replace(re, unit.repeat(amount));
}

/**
 * inquiry("production").production() // => true
 * @param {string} str
 * @returns {import("../string_inquirer.js").Inquiry}
 */
export const inquiry = (str) => /** @type {import("../string_inquirer.js").Inquiry} */ (new StringInquirer(str));

/**
 * @param {string} str
 * @param {string} substring
 * @returns {boolean}
 */
export const exclude = (str, substring) => !str.includes(substring);

/**
 * toDate("2012-12-13") parses a date-only string as a local date (Rails' to_date).
 * @param {string} str
 * @returns {Date}
 */
export function toDate(str) {
  const m = String(str).match(/^\s*(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(str);
  if (Number.isNaN(d.getTime())) throw new RangeError(`invalid date: ${str}`);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * toTime("2012-12-13 06:12") parses as local time (or UTC with form "utc").
 * @param {string | null | undefined} str
 * @param {"local" | "utc"} [form]
 * @returns {Date | undefined}
 */
export function toTime(str, form = "local") {
  if (isBlankString(str)) return undefined;
  const m = String(str).match(/^\s*(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?)?\s*(Z|[+-]\d{2}:?\d{2})?\s*$/);
  if (!m) {
    const d = new Date(str);
    if (Number.isNaN(d.getTime())) throw new RangeError(`invalid date: ${str}`);
    return d;
  }
  const [, y, mo, d, h = 0, mi = 0, s = 0, frac = "0", zone] = m;
  const ms = Math.round(Number(`0.${frac}`) * 1000);
  /** @type {[number, number, number, number, number, number, number]} */
  const parts = [Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s), ms];
  if (zone) {
    const utc = Date.UTC(...parts);
    if (zone === "Z") return new Date(utc);
    const sign = zone[0] === "-" ? -1 : 1;
    const [zh, zm] = zone.slice(1).replace(":", "").match(/(\d{2})(\d{2})/).slice(1).map(Number);
    return new Date(utc - sign * (zh * 60 + zm) * 60000);
  }
  return form === "utc" ? new Date(Date.UTC(...parts)) : new Date(...parts);
}

/** @param {unknown} s */
const isBlankString = (s) => s == null || /^\s*$/.test(String(s));
