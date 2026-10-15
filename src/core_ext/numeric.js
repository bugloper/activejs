// Port of active_support/core_ext/numeric and core_ext/integer.
import * as NumberHelper from "../number_helper.js";

export const KILOBYTE = 1024;
export const MEGABYTE = KILOBYTE * 1024;
export const GIGABYTE = MEGABYTE * 1024;
export const TERABYTE = GIGABYTE * 1024;
export const PETABYTE = TERABYTE * 1024;
export const EXABYTE = PETABYTE * 1024;
export const ZETTABYTE = EXABYTE * 1024;

/**
 * bytes(2) // => 2; megabytes(2) // => 2097152
 * @param {number} n
 * @returns {number}
 */
export const bytes = (n) => n;
/**
 * @param {number} n
 * @returns {number}
 */
export const kilobytes = (n) => n * KILOBYTE;
/**
 * @param {number} n
 * @returns {number}
 */
export const megabytes = (n) => n * MEGABYTE;
/**
 * @param {number} n
 * @returns {number}
 */
export const gigabytes = (n) => n * GIGABYTE;
/**
 * @param {number} n
 * @returns {number}
 */
export const terabytes = (n) => n * TERABYTE;
/**
 * @param {number} n
 * @returns {number}
 */
export const petabytes = (n) => n * PETABYTE;
/**
 * @param {number} n
 * @returns {number}
 */
export const exabytes = (n) => n * EXABYTE;
/**
 * @param {number} n
 * @returns {number}
 */
export const zettabytes = (n) => n * ZETTABYTE;

/**
 * isMultipleOf(6, 3) // => true; isMultipleOf(5, 0) // => false
 * @param {number} n
 * @param {number} number
 * @returns {boolean}
 */
export const isMultipleOf = (n, number) => (number === 0 ? n === 0 : n % number === 0);

/**
 * isBetween(5, 1, 10) // => true (inclusive)
 * @param {number} n
 * @param {number} min
 * @param {number} max
 * @returns {boolean}
 */
export const isBetween = (n, min, max) => n >= min && n <= max;

/**
 * clamp(15, 0, 10) // => 10
 * @param {number} n
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export const clamp = (n, min, max) => Math.min(Math.max(n, min), max);

/** @type {Record<string, (n: number, options?: any) => unknown>} */
const NUMBER_FORMATS = {
  phone: NumberHelper.numberToPhone,
  currency: NumberHelper.numberToCurrency,
  percentage: NumberHelper.numberToPercentage,
  delimited: NumberHelper.numberToDelimited,
  rounded: NumberHelper.numberToRounded,
  human: NumberHelper.numberToHuman,
  human_size: NumberHelper.numberToHumanSize,
  humanSize: NumberHelper.numberToHumanSize,
};

/**
 * toFormattedS(1234567, "delimited") // => "1,234,567"
 * toFormattedS(65, "percentage", { precision: 0 }) // => "65%"
 * @param {number} n
 * @param {"phone" | "currency" | "percentage" | "delimited" | "rounded" | "human" | "human_size" | "humanSize" | (string & {})} [format]
 * @param {object} [options]
 * @returns {string}
 */
export function toFormattedS(n, format, options) {
  const formatter = NUMBER_FORMATS[format];
  return formatter ? /** @type {string} */ (formatter(n, options)) : String(n);
}
