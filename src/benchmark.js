// Port of ActiveSupport::Benchmark.realtime and Logger#benchmark-style helpers.
//
//   const seconds = realtime(() => work())
//   const ms = realtime("float_millisecond", () => work())
//   const ms = await realtimeAsync("float_millisecond", async () => await work())
import { performance } from "node:perf_hooks";

/** @typedef {"float_second" | "float_millisecond" | "float_microsecond" | "second" | "millisecond" | "microsecond" | "nanosecond"} TimeUnit */

/** @type {Record<TimeUnit, (ms: number) => number>} */
const UNITS = {
  float_second: (ms) => ms / 1000,
  float_millisecond: (ms) => ms,
  float_microsecond: (ms) => ms * 1000,
  second: (ms) => Math.floor(ms / 1000),
  millisecond: (ms) => Math.floor(ms),
  microsecond: (ms) => Math.floor(ms * 1000),
  nanosecond: (ms) => Math.floor(ms * 1e6),
};

/**
 * @param {string} unit
 * @returns {(ms: number) => number}
 */
function unitFn(unit) {
  const fn = UNITS[unit];
  if (!fn) throw new TypeError(`unknown unit ${unit}; use one of ${Object.keys(UNITS).join(", ")}`);
  return fn;
}

/**
 * @overload
 * @param {() => unknown} unit
 * @returns {number}
 */
/**
 * @overload
 * @param {TimeUnit} unit
 * @param {() => unknown} fn
 * @returns {number}
 */
/**
 * @param {TimeUnit | (() => unknown)} unit
 * @param {() => unknown} [fn]
 * @returns {number}
 */
export function realtime(unit, fn) {
  if (typeof unit === "function") [unit, fn] = ["float_second", unit];
  const convert = unitFn(unit);
  const start = performance.now();
  fn();
  return convert(performance.now() - start);
}

/**
 * @overload
 * @param {() => unknown} unit
 * @returns {Promise<number>}
 */
/**
 * @overload
 * @param {TimeUnit} unit
 * @param {() => unknown} fn
 * @returns {Promise<number>}
 */
/**
 * @param {TimeUnit | (() => unknown)} unit
 * @param {() => unknown} [fn]
 * @returns {Promise<number>}
 */
export async function realtimeAsync(unit, fn) {
  if (typeof unit === "function") [unit, fn] = ["float_second", unit];
  const convert = unitFn(unit);
  const start = performance.now();
  await fn();
  return convert(performance.now() - start);
}

/**
 * Logs "message (12.3ms)" at the given level after running fn.
 *   benchmark(logger, "Process data files", () => expensiveFilesOperation())
 *   benchmark(logger, "Import", { level: "debug", silence: true }, () => importAll())
 * @template T
 * @overload
 * @param {any} logger
 * @param {string} message
 * @param {() => T} options
 * @returns {T}
 */
/**
 * @template T
 * @overload
 * @param {any} logger
 * @param {string} message
 * @param {{ level?: string, silence?: boolean }} options
 * @param {() => T} fn
 * @returns {T}
 */
/**
 * @template T
 * @param {any} logger
 * @param {string} message
 * @param {{ level?: string, silence?: boolean } | (() => T)} options
 * @param {() => T} [fn]
 * @returns {T}
 */
export function benchmark(logger, message, options, fn) {
  if (typeof options === "function") [options, fn] = [{}, options];
  const { level = "info", silence = false } = /** @type {{ level?: string, silence?: boolean }} */ (options);
  /** @type {T} */
  let result;
  const ms = realtime("float_millisecond", () => {
    result = silence && logger?.silence ? logger.silence(() => fn()) : fn();
  });
  logger?.[level]?.(`${message} (${ms.toFixed(1)}ms)`);
  return result;
}
