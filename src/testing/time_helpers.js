// Port of ActiveSupport::Testing::TimeHelpers.
//
//   travelTo(new Date(2004, 10, 24, 1, 4, 44))  // Date.now() / new Date() are frozen there
//   travel(days(1), () => { ... })              // block form restores afterwards
//   freezeTime(async () => { ... })             // async blocks restore when settled
//   travelBack()
//
// Like Rails, time is frozen (not ticking) while stubbed and sub-second
// precision is dropped unless { withUsec: true } is passed. Stubbing works by
// swapping globalThis.Date for a subclass; `instanceof Date` keeps working for
// dates created before or after the swap.

/** @typedef {{ withUsec?: boolean }} TravelOptions */

const RealDate = globalThis.Date;
/** @type {number | null} */
let stubbedAt = null;

class FakeDate extends RealDate {
  /** @param {unknown[]} args */
  constructor(...args) {
    if (args.length === 0 && stubbedAt !== null) super(stubbedAt);
    // @ts-expect-error -- forwards whatever arguments Date's own constructor overloads accept
    else super(...args);
  }

  static now() {
    return stubbedAt ?? RealDate.now();
  }

  /**
   * @param {unknown} value
   * @returns {boolean}
   */
  static [Symbol.hasInstance](value) {
    return value instanceof RealDate;
  }
}

/** @param {number} time */
const install = (time) => {
  stubbedAt = time;
  // @ts-expect-error -- deliberately swaps the global Date constructor for the stubbing subclass
  globalThis.Date = FakeDate;
};

/**
 * @template T
 * @param {() => T} [fn]
 * @returns {T | undefined}
 */
export function travelBack(fn) {
  const previous = stubbedAt;
  stubbedAt = null;
  globalThis.Date = RealDate;
  if (fn) {
    return withRestore(fn, () => {
      if (previous !== null) install(previous);
    });
  }
  return undefined;
}
export const returnToOriginalTime = travelBack;
export const unfreezeTime = travelBack;

/**
 * @template T
 * @param {() => T} fn
 * @param {() => void} restore
 * @returns {T}
 */
function withRestore(fn, restore) {
  /** @type {any} */
  let result;
  try {
    result = fn();
  } catch (e) {
    restore();
    throw e;
  }
  if (result && typeof result.then === "function") return result.finally(restore);
  restore();
  return result;
}

/**
 * @template T
 * @overload
 * @param {Date | number | string} dateOrTime
 * @param {() => T} fn
 * @returns {T}
 */
/**
 * @template T
 * @overload
 * @param {Date | number | string} dateOrTime
 * @param {TravelOptions | undefined} options
 * @param {() => T} fn
 * @returns {T}
 */
/**
 * @overload
 * @param {Date | number | string} dateOrTime
 * @param {TravelOptions} [options]
 * @returns {undefined}
 */
/**
 * @param {Date | number | string} dateOrTime
 * @param {TravelOptions | (() => unknown)} [fnOrOptions]
 * @param {() => unknown} [maybeFn]
 * @returns {unknown}
 */
export function travelTo(dateOrTime, fnOrOptions, maybeFn) {
  const [options, fn] = typeof fnOrOptions === "function" ? [{}, fnOrOptions] : [fnOrOptions ?? {}, maybeFn];
  const ms = new RealDate(dateOrTime instanceof RealDate ? dateOrTime.getTime() : dateOrTime).getTime();
  if (Number.isNaN(ms)) throw new TypeError(`Invalid date: ${dateOrTime}`);
  const target = options.withUsec ? ms : Math.floor(ms / 1000) * 1000;

  const previous = stubbedAt;
  install(target);
  if (!fn) return undefined;
  return withRestore(fn, () => (previous === null ? travelBack() : install(previous)));
}

/**
 * travel(days(1)) or travel(3600) (seconds) from the current (possibly stubbed) time.
 * @template T
 * @overload
 * @param {number | { valueOf(): number }} duration
 * @param {() => T} fn
 * @returns {T}
 */
/**
 * @template T
 * @overload
 * @param {number | { valueOf(): number }} duration
 * @param {TravelOptions | undefined} options
 * @param {() => T} fn
 * @returns {T}
 */
/**
 * @overload
 * @param {number | { valueOf(): number }} duration
 * @param {TravelOptions} [options]
 * @returns {undefined}
 */
/**
 * @param {number | { valueOf(): number }} duration
 * @param {TravelOptions | (() => unknown)} [fnOrOptions]
 * @param {() => unknown} [maybeFn]
 * @returns {unknown}
 */
export function travel(duration, fnOrOptions, maybeFn) {
  const seconds = Number(duration.valueOf());
  // Casts: the public overloads don't cover forwarding the implementation's union.
  return travelTo(new RealDate(FakeDate.now() + seconds * 1000), /** @type {any} */ (fnOrOptions), maybeFn);
}

/**
 * @template T
 * @overload
 * @param {() => T} fn
 * @returns {T}
 */
/**
 * @template T
 * @overload
 * @param {TravelOptions | undefined} options
 * @param {() => T} fn
 * @returns {T}
 */
/**
 * @overload
 * @param {TravelOptions} [options]
 * @returns {undefined}
 */
/**
 * @param {TravelOptions | (() => unknown)} [fnOrOptions]
 * @param {() => unknown} [maybeFn]
 * @returns {unknown}
 */
export function freezeTime(fnOrOptions, maybeFn) {
  return travelTo(new RealDate(FakeDate.now()), /** @type {any} */ (fnOrOptions ?? { withUsec: true }), maybeFn);
}

/** @returns {boolean} */
export const isTimeStubbed = () => stubbedAt !== null;
