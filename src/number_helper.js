// Port of ActiveSupport::NumberHelper with Rails' default "en" formats.
//
// Rails uses BigDecimal; here rounding is done on the decimal string so values
// like 1.005 round the way people expect (to 1.01, not 1.00).

/**
 * @typedef {number | string | bigint} Numeric
 * Numbers, bigints and numeric strings are formatted; a string that isn't
 * numeric is returned unchanged.
 */

/**
 * @typedef {object} RoundingOptions
 * @property {number} [precision]
 * @property {boolean} [significant]
 * @property {string} [separator]
 * @property {string} [delimiter]
 * @property {boolean} [stripInsignificantZeros]
 */

/** @param {unknown} s */
const escapeRegExp = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * @param {unknown} number
 * @returns {number | undefined}
 */
const parseNumber = (number) => {
  if (typeof number === "number") return number;
  if (typeof number === "bigint") return Number(number);
  if (typeof number === "string" && /^\s*[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?\s*$/i.test(number)) return Number(number);
  return undefined;
};

/**
 * Round half away from zero at `precision` decimal places without float drift.
 * @param {number} number
 * @param {number} precision
 * @returns {number}
 */
function roundTo(number, precision) {
  if (!Number.isFinite(number)) return number;
  const sign = number < 0 ? -1 : 1;
  const shifted = Math.round(Number(`${Math.abs(number)}e${precision}`));
  return sign * Number(`${shifted}e${-precision}`);
}

/**
 * @param {number} number
 * @returns {number}
 */
export const digitCount = (number) => (number === 0 ? 1 : Math.floor(Math.log10(Math.abs(number)) + 1));

/**
 * @param {number} number
 * @param {number} precision
 * @returns {number}
 */
function roundSignificant(number, precision) {
  if (number === 0) return 0;
  const digits = digitCount(number);
  return roundTo(number, precision - digits);
}

/**
 * Plain decimal string (no exponent) with exactly `decimals` fraction digits.
 * @param {number} number
 * @param {number} decimals
 * @returns {string}
 */
function toFixedString(number, decimals) {
  if (Math.abs(number) < 1e21) return number.toFixed(Math.min(decimals, 100));
  return BigInt(Math.round(number)).toString() + (decimals > 0 ? "." + "0".repeat(decimals) : "");
}

const DELIMITER_REGEX = /(\d)(?=(\d\d\d)+(?!\d))/g;

/**
 * numberToDelimited(12345678) // => "12,345,678"
 * numberToDelimited("123456.78", { delimiter: ".", separator: "," }) // => "123.456,78"
 * @param {Numeric} number
 * @param {{ delimiter?: string, separator?: string, delimiterPattern?: RegExp }} [options]
 * @returns {string}
 */
export function numberToDelimited(number, { delimiter = ",", separator = ".", delimiterPattern = undefined } = {}) {
  if (parseNumber(number) === undefined) return /** @type {string} */ (number);
  const [left, right] = String(number).split(".");
  const pattern = delimiterPattern
    ? new RegExp(delimiterPattern.source, delimiterPattern.flags.includes("g") ? delimiterPattern.flags : delimiterPattern.flags + "g")
    : DELIMITER_REGEX;
  const delimited = left.replace(pattern, (_, digit) => `${digit}${delimiter}`);
  return right === undefined ? delimited : `${delimited}${separator}${right}`;
}

/**
 * numberToRounded(111.2345) // => "111.235"
 * numberToRounded(111.2345, { precision: 2 }) // => "111.23"
 * numberToRounded(111.2345, { significant: true, precision: 2 }) // => "110"
 * numberToRounded(13, { precision: 5, stripInsignificantZeros: true }) // => "13"
 * @param {Numeric} number
 * @param {RoundingOptions} [options]
 * @returns {string}
 */
export function numberToRounded(
  number,
  { precision = 3, significant = false, separator = ".", delimiter = "", stripInsignificantZeros = false } = {},
) {
  const value = parseNumber(number);
  if (value === undefined) return /** @type {string} */ (number);
  if (!Number.isFinite(value)) return String(value);

  let rounded;
  let decimals = precision ?? 0;
  if (precision == null) {
    rounded = value;
  } else if (significant && precision > 0) {
    rounded = roundSignificant(value, precision);
    decimals = Math.max(0, precision - digitCount(rounded));
  } else {
    rounded = roundTo(value, precision);
  }
  if (rounded === 0) rounded = 0; // no negative zero

  const formatted = precision == null ? String(rounded) : toFixedString(rounded, decimals);
  const delimited = numberToDelimited(formatted, { delimiter, separator });
  if (!stripInsignificantZeros) return delimited;
  const sep = escapeRegExp(separator);
  return delimited.replace(new RegExp(`(${sep})(\\d*[1-9])?0+$`), "$1$2").replace(new RegExp(`${sep}$`), "");
}

/**
 * numberToCurrency(1234567890.50) // => "$1,234,567,890.50"
 * numberToCurrency(-1234567890.50, { negativeFormat: "(%u%n)" }) // => "($1,234,567,890.50)"
 * numberToCurrency(1234567890.50, { unit: "€", separator: ",", delimiter: ".", format: "%n %u" })
 * @param {Numeric} number
 * @param {RoundingOptions & { unit?: string, format?: string, negativeFormat?: string }} [options]
 * @returns {string}
 */
export function numberToCurrency(number, options = {}) {
  const {
    unit = "$",
    precision = 2,
    separator = ".",
    delimiter = ",",
    format = "%u%n",
    stripInsignificantZeros = false,
  } = options;
  const negativeFormat = options.negativeFormat ?? `-${format}`;
  let value = parseNumber(number);
  let fmt = format;
  let numberString;
  if (value === undefined) {
    numberString = String(number);
  } else {
    if (value < 0) {
      value = Math.abs(value);
      if (value * 10 ** precision >= 0.5) fmt = negativeFormat;
    }
    numberString = numberToRounded(value, { precision, separator, delimiter, stripInsignificantZeros });
  }
  return fmt.replace("%n", numberString).replace("%u", unit);
}

/**
 * numberToPercentage(100) // => "100.000%"
 * numberToPercentage(302.24398923423, { precision: 5 }) // => "302.24399%"
 * @param {Numeric} number
 * @param {RoundingOptions & { format?: string }} [options]
 * @returns {string}
 */
export function numberToPercentage(number, { format = "%n%", precision = 3, ...rest } = {}) {
  const value = parseNumber(number);
  if (value === undefined) return /** @type {string} */ (number);
  return format.replace("%n", numberToRounded(value, { precision, ...rest }));
}

const STORAGE_UNITS = ["Bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB"];

/**
 * numberToHumanSize(1234567) // => "1.18 MB"
 * numberToHumanSize(1) // => "1 Byte"
 * @param {Numeric} number
 * @param {RoundingOptions & { format?: string }} [options]
 * @returns {string}
 */
export function numberToHumanSize(number, options = {}) {
  const value = parseNumber(number);
  if (value === undefined) return /** @type {string} */ (number);
  const {
    precision = 3,
    significant = true,
    stripInsignificantZeros = true,
    separator = ".",
    delimiter = "",
    format = "%n %u",
  } = options;
  const base = 1024;
  let numberString;
  let unit;
  if (Math.trunc(value) < base) {
    numberString = String(Math.trunc(value));
    unit = Math.trunc(value) === 1 ? "Byte" : "Bytes";
  } else {
    const exponent = Math.min(Math.trunc(Math.log(value) / Math.log(base)), STORAGE_UNITS.length - 1);
    numberString = numberToRounded(value / base ** exponent, {
      precision, significant, stripInsignificantZeros, separator, delimiter,
    });
    unit = STORAGE_UNITS[exponent];
  }
  return format.replace("%n", numberString).replace("%u", unit);
}

/** @type {Record<string, string>} */
const DECIMAL_UNITS = {
  0: "unit", 1: "ten", 2: "hundred", 3: "thousand", 6: "million", 9: "billion", 12: "trillion",
  15: "quadrillion", "-1": "deci", "-2": "centi", "-3": "mili", "-6": "micro", "-9": "nano",
  "-12": "pico", "-15": "femto",
};
const INVERTED_DECIMAL_UNITS = Object.fromEntries(Object.entries(DECIMAL_UNITS).map(([k, v]) => [v, Number(k)]));

const DEFAULT_HUMAN_UNITS = {
  unit: "", thousand: "Thousand", million: "Million", billion: "Billion",
  trillion: "Trillion", quadrillion: "Quadrillion",
};

/**
 * numberToHuman(1234567) // => "1.23 Million"
 * numberToHuman(500000000, { precision: 5 }) // => "500 Million"
 * numberToHuman(343, { units: { unit: "Meters", thousand: "Kilometers" } }) // => "343 Meters"
 * @param {Numeric} number
 * @param {RoundingOptions & { format?: string, units?: Record<string, string | ((count: number) => string)> }} [options]
 * @returns {string}
 */
export function numberToHuman(number, options = {}) {
  let value = parseNumber(number);
  if (value === undefined) return /** @type {string} */ (number);
  const {
    precision = 3,
    significant = true,
    stripInsignificantZeros = true,
    separator = ".",
    delimiter = "",
    units = DEFAULT_HUMAN_UNITS,
    format = "%n %u",
  } = options;
  const roundOpts = { precision, significant, stripInsignificantZeros, separator, delimiter };

  value = significant && precision > 0 ? roundSignificant(value, precision) : roundTo(value, precision);

  const exponents = Object.keys(units)
    .map((name) => INVERTED_DECIMAL_UNITS[name])
    .filter((e) => e !== undefined)
    .sort((a, b) => b - a);
  const magnitude = value === 0 ? 0 : Math.floor(Math.log10(Math.abs(value)));
  const exponent = exponents.find((e) => magnitude >= e) ?? 0;

  const scaled = value / 10 ** exponent;
  const unitName = DECIMAL_UNITS[exponent];
  const unit = typeof units[unitName] === "function" ? units[unitName](Math.trunc(scaled)) : (units[unitName] ?? "");
  return format.replace("%n", numberToRounded(scaled, roundOpts)).replace("%u", unit).trim();
}

/**
 * numberToPhone(5551234) // => "555-1234"
 * numberToPhone(1235551234, { areaCode: true }) // => "(123) 555-1234"
 * numberToPhone(1235551234, { countryCode: 1, extension: 1343, delimiter: "." })
 * // => "+1.123.555.1234 x 1343"
 * @param {number | string | bigint} number
 * @param {{ areaCode?: boolean, delimiter?: string, extension?: string | number, countryCode?: string | number, pattern?: RegExp }} [options]
 * @returns {string}
 */
export function numberToPhone(number, { areaCode = false, delimiter = "-", extension = undefined, countryCode = undefined, pattern = undefined } = {}) {
  if (number === null || number === undefined) return /** @type {string} */ (number);
  let str = String(number).trim();
  if (areaCode) {
    const re = pattern ?? /(\d{1,3})(\d{3})(\d{4}$)/;
    str = str.replace(re, `($1) $2${delimiter}$3`);
  } else {
    const re = pattern ?? /(\d{0,3})(\d{3})(\d{4})$/;
    str = str.replace(re, `$1${delimiter}$2${delimiter}$3`);
    if (delimiter && str.startsWith(delimiter)) str = str.slice(delimiter.length);
  }
  /** @param {unknown} v */
  const blank = (v) => v === undefined || v === null || String(v).trim() === "";
  const prefix = blank(countryCode) ? "" : `+${countryCode}${delimiter}`;
  const suffix = blank(extension) ? "" : ` x ${extension}`;
  return prefix + str + suffix;
}
