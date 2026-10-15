// Port of ActiveSupport::SafeBuffer and ERB::Util escaping helpers.
//
//   const out = htmlSafe("<b>")      // marked safe, never escaped again
//   out.concat("<script>")           // unsafe input is escaped on the way in
//   String(out)                      // => "<b>&lt;script&gt;"
//   htmlEscape("<x>")                // => "&lt;x&gt;"
//   safeJoin(["<p>", htmlSafe("<br>")], htmlSafe("<br>"))

/** @type {Record<string, string>} */
const HTML_ESCAPE = { "&": "&amp;", ">": "&gt;", "<": "&lt;", '"': "&quot;", "'": "&#39;" };
const HTML_ESCAPE_ONCE_REGEXP = /["><']|&(?!([a-zA-Z]+|(#\d+)|(#[xX][\dA-Fa-f]+));)/g;
/** @type {Record<string, string>} */
const JSON_ESCAPE = { "&": "\\u0026", ">": "\\u003e", "<": "\\u003c", "\u2028": "\\u2028", "\u2029": "\\u2029" };

export class SafeBuffer extends String {
  /** @param {string} [value] */
  constructor(value = "") {
    super(value);
  }

  /** @returns {true} */
  isHtmlSafe() { return true; }
  /** @returns {this} */
  htmlSafe() { return this; }

  /**
   * Returns a new SafeBuffer with value appended (escaped unless safe).
   * @param {...unknown} values
   * @returns {SafeBuffer & string} A SafeBuffer; typed with `string` so it stays compatible with String#concat.
   */
  concat(...values) {
    return /** @type {SafeBuffer & string} */ (new SafeBuffer(this.valueOf() + values.map((v) => htmlEscapeInterpolatedArgument(v)).join("")));
  }
  /**
   * @param {unknown} value
   * @returns {SafeBuffer}
   */
  plus(value) { return /** @type {SafeBuffer} */ (this.concat(value)); }

  /**
   * Like String#%: formats with escaped arguments.
   * @param {...unknown} args
   * @returns {SafeBuffer}
   */
  format(...args) {
    let i = 0;
    return new SafeBuffer(this.valueOf().replace(/%s/g, () => htmlEscapeInterpolatedArgument(args[i++])));
  }

  /** @returns {string} */
  toString() { return this.valueOf(); }
  /** @returns {string} */
  toJSON() { return this.valueOf(); }
}

/**
 * @param {unknown} value
 * @returns {SafeBuffer}
 */
export const htmlSafe = (value) => (value instanceof SafeBuffer ? value : new SafeBuffer(String(value ?? "")));

/**
 * Numbers, booleans and null/undefined are safe to output, like Ruby's
 * Numeric#html_safe? and nil.html_safe?.
 * @param {unknown} value
 * @returns {boolean}
 */
export function isHtmlSafe(value) {
  if (value instanceof SafeBuffer) return true;
  if (value === null || value === undefined) return true;
  return typeof value === "number" || typeof value === "boolean" || typeof value === "bigint";
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function htmlEscapeInterpolatedArgument(value) {
  return isHtmlSafe(value) ? String(value ?? "") : unwrappedHtmlEscape(value);
}

/**
 * @param {unknown} value
 * @returns {string}
 */
export function unwrappedHtmlEscape(value) {
  const s = String(value ?? "");
  return s.replace(/[&<>"']/g, (c) => HTML_ESCAPE[c]);
}

/**
 * htmlEscape("is a > 0 & a < 10?") // => "is a &gt; 0 &amp; a &lt; 10?" (SafeBuffer)
 * @param {unknown} value
 * @returns {SafeBuffer}
 */
export function htmlEscape(value) {
  if (value instanceof SafeBuffer) return value;
  return new SafeBuffer(unwrappedHtmlEscape(value));
}
export const h = htmlEscape;

/**
 * Escapes without double-escaping existing entities.
 * @param {unknown} value
 * @returns {SafeBuffer}
 */
export function htmlEscapeOnce(value) {
  return new SafeBuffer(String(value ?? "").replace(HTML_ESCAPE_ONCE_REGEXP, (c) => HTML_ESCAPE[c]));
}

/**
 * Makes JSON safe to embed in a <script> tag.
 * @param {unknown} value
 * @returns {string}
 */
export function jsonEscape(value) {
  return String(value).replace(/[&><\u2028\u2029]/g, (c) => JSON_ESCAPE[c]);
}

/**
 * @param {unknown} value
 * @returns {string}
 */
export function urlEncode(value) {
  return encodeURIComponent(String(value)).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

/**
 * Escapes a string so it's a valid XML/HTML tag name.
 * @param {unknown} name
 * @returns {string}
 */
export function xmlNameEscape(name) {
  const s = String(name);
  if (s === "") return s;
  const start = /[A-Za-z_:\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD]/;
  const following = /[A-Za-z_:\-.0-9\u00B7\u0300-\u036F\u203F-\u2040\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD]/;
  const chars = [...s];
  const first = start.test(chars[0]) ? chars[0] : "_";
  return first + chars.slice(1).map((c) => (following.test(c) ? c : "_")).join("");
}

/**
 * Joins after escaping unsafe items and the separator; returns a SafeBuffer.
 * @param {unknown[]} array
 * @param {unknown} [separator]
 * @returns {SafeBuffer}
 */
export function safeJoin(array, separator = "$") {
  const sep = htmlEscapeInterpolatedArgument(separator === "$" ? "" : separator);
  return new SafeBuffer(array.flat(Infinity).map(htmlEscapeInterpolatedArgument).join(sep));
}
