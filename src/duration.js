// Port of ActiveSupport::Duration, including ISO 8601 parsing/serialization.
//
//   import { days, hours, Duration } from "activejs"
//   days(2).plus(hours(3)).fromNow()
//   Duration.parse("P3Y6M4DT12H30M5S").inspect()
//   // => "3 years, 6 months, 4 days, 12 hours, 30 minutes, and 5 seconds"
import { advance, since as timeSince } from "./core_ext/date.js";
import { toSentence } from "./core_ext/array.js";

/** @typedef {"years" | "months" | "weeks" | "days" | "hours" | "minutes" | "seconds"} DurationPart */
/** @typedef {Readonly<Partial<Record<DurationPart, number>>>} DurationParts */
/** @typedef {Date | import("./time_zone.js").TimeWithZone} TimeLike */

export const SECONDS_PER_MINUTE = 60;
export const SECONDS_PER_HOUR = 3600;
export const SECONDS_PER_DAY = 86400;
export const SECONDS_PER_WEEK = 604800;
export const SECONDS_PER_MONTH = 2629746; // 1/12 of a gregorian year
export const SECONDS_PER_YEAR = 31556952; // length of a gregorian year (365.2425 days)

const PARTS_IN_SECONDS = {
  seconds: 1,
  minutes: SECONDS_PER_MINUTE,
  hours: SECONDS_PER_HOUR,
  days: SECONDS_PER_DAY,
  weeks: SECONDS_PER_WEEK,
  months: SECONDS_PER_MONTH,
  years: SECONDS_PER_YEAR,
};

/** @type {DurationPart[]} */
const PARTS = ["years", "months", "weeks", "days", "hours", "minutes", "seconds"];
const VARIABLE_PARTS = ["years", "months", "weeks", "days"];

export class ISO8601ParsingError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = "ISO8601ParsingError";
  }
}

const sortedParts = (parts) =>
  Object.fromEntries(PARTS.filter((p) => parts[p] !== undefined).map((p) => [p, parts[p]]));

const roundFloat = (n) => Math.round(n * 1e9) / 1e9;

export class Duration {
  /**
   * @param {number} value seconds
   * @param {DurationParts} [parts]
   * @param {boolean} [variable]
   */
  constructor(value, parts = {}, variable) {
    /** @type {number} */
    this.value = value;
    // Like Rails, zero parts are dropped unless the whole duration is zero.
    const kept = value === 0 ? parts : Object.fromEntries(Object.entries(parts).filter(([, v]) => v !== 0));
    /** @type {DurationParts} */
    this.parts = Object.freeze(sortedParts(kept));
    /** @type {boolean} */
    this.variable = variable ?? Object.keys(this.parts).some((p) => VARIABLE_PARTS.includes(p));
    Object.freeze(this);
  }

  /**
   * @param {number} value
   * @returns {Duration}
   */
  static seconds(value) { return new Duration(value, { seconds: value }, false); }
  /**
   * @param {number} value
   * @returns {Duration}
   */
  static minutes(value) { return new Duration(value * SECONDS_PER_MINUTE, { minutes: value }, false); }
  /**
   * @param {number} value
   * @returns {Duration}
   */
  static hours(value) { return new Duration(value * SECONDS_PER_HOUR, { hours: value }, false); }
  /**
   * @param {number} value
   * @returns {Duration}
   */
  static days(value) { return new Duration(value * SECONDS_PER_DAY, { days: value }, true); }
  /**
   * @param {number} value
   * @returns {Duration}
   */
  static weeks(value) { return new Duration(value * SECONDS_PER_WEEK, { weeks: value }, true); }
  /**
   * @param {number} value
   * @returns {Duration}
   */
  static months(value) { return new Duration(value * SECONDS_PER_MONTH, { months: value }, true); }
  /**
   * @param {number} value
   * @returns {Duration}
   */
  static years(value) { return new Duration(value * SECONDS_PER_YEAR, { years: value }, true); }

  /**
   * Builds a Duration from seconds, decomposing it into the largest parts:
   *   Duration.build(2716146).parts // => { months: 1, days: 1 }
   * @param {number} value
   * @returns {Duration}
   */
  static build(value) {
    if (typeof value !== "number") throw new TypeError(`expected a number, got ${value}`);
    const parts = {};
    if (value !== 0) {
      const sign = Math.sign(value);
      let remainder = Math.abs(roundFloat(value));
      for (const part of ["years", "months", "weeks", "days", "hours", "minutes"]) {
        const unit = PARTS_IN_SECONDS[part];
        const count = Math.floor(remainder / unit);
        if (count) parts[part] = sign * count;
        remainder = roundFloat(remainder - count * unit);
      }
      if (remainder) parts.seconds = sign * remainder;
    }
    return new Duration(value, parts);
  }

  /**
   * Duration.parse("P1Y2M10DT2H30M") — throws ISO8601ParsingError on bad input.
   * @param {string} iso8601duration
   * @returns {Duration}
   */
  static parse(iso8601duration) {
    return parseISO8601(iso8601duration);
  }

  // ---- arithmetic ----------------------------------------------------------

  /**
   * @param {Duration | number} other
   * @returns {Duration}
   */
  plus(other) {
    if (other instanceof Duration) {
      const parts = { ...this.parts };
      for (const [k, v] of Object.entries(other.parts)) parts[k] = (parts[k] ?? 0) + v;
      return new Duration(this.value + other.value, parts, this.variable || other.variable);
    }
    const seconds = Number(other);
    return new Duration(this.value + seconds, { ...this.parts, seconds: (this.parts.seconds ?? 0) + seconds }, this.variable);
  }

  /**
   * @param {Duration | number} other
   * @returns {Duration}
   */
  minus(other) {
    return this.plus(other instanceof Duration ? other.negate() : -Number(other));
  }

  /** @returns {Duration} */
  negate() {
    return new Duration(-this.value, Object.fromEntries(Object.entries(this.parts).map(([k, v]) => [k, -v])), this.variable);
  }

  /**
   * @param {Duration | number} n
   * @returns {Duration}
   */
  times(n) {
    if (n instanceof Duration) {
      if (this.variable && n.variable) throw new TypeError("Can't multiply two variable durations");
      return new Duration(this.value * n.value, { seconds: this.value * n.value }, false);
    }
    return new Duration(
      this.value * n,
      Object.fromEntries(Object.entries(this.parts).map(([k, v]) => [k, v * n])),
      this.variable,
    );
  }

  /**
   * Duration / number => Duration; Duration / Duration => number
   * @overload
   * @param {Duration} n
   * @returns {number}
   */
  /**
   * @overload
   * @param {number} n
   * @returns {Duration}
   */
  /**
   * @param {Duration | number} n
   * @returns {Duration | number}
   */
  dividedBy(n) {
    if (n instanceof Duration) return this.value / n.value;
    return new Duration(
      this.value / n,
      Object.fromEntries(Object.entries(this.parts).map(([k, v]) => [k, v / n])),
      this.variable,
    );
  }

  /**
   * @param {Duration | number} n
   * @returns {Duration}
   */
  modulo(n) {
    const divisor = n instanceof Duration ? n.value : Number(n);
    return Duration.build(((this.value % divisor) + divisor) % divisor);
  }

  /** @returns {Duration} */
  abs() {
    return this.value < 0 ? this.negate() : this;
  }

  // ---- comparison ----------------------------------------------------------

  /**
   * @param {Duration | number} other
   * @returns {boolean}
   */
  equals(other) {
    return other instanceof Duration ? this.value === other.value : this.value === Number(other);
  }

  /**
   * Strict equality on parts, like eql?: days(1).eql(hours(24)) is false.
   * @param {unknown} other
   * @returns {boolean}
   */
  eql(other) {
    if (!(other instanceof Duration) || other.value !== this.value) return false;
    const a = Object.entries(this.parts);
    const b = other.parts;
    return a.length === Object.keys(b).length && a.every(([k, v]) => b[k] === v);
  }

  /**
   * @param {Duration | number} other
   * @returns {number}
   */
  compareTo(other) {
    const v = other instanceof Duration ? other.value : Number(other);
    return Math.sign(this.value - v);
  }

  /** @returns {boolean} */
  isVariable() {
    return this.variable;
  }

  // ---- conversions ---------------------------------------------------------

  valueOf() { return this.value; }
  toNumber() { return this.value; }
  toInt() { return Math.trunc(this.value); }
  toI() { return Math.trunc(this.value); }
  toString() { return String(this.value); }
  toJSON() { return this.value; }

  inSeconds() { return this.value; }
  inMinutes() { return this.value / SECONDS_PER_MINUTE; }
  inHours() { return this.value / SECONDS_PER_HOUR; }
  inDays() { return this.value / SECONDS_PER_DAY; }
  inWeeks() { return this.value / SECONDS_PER_WEEK; }
  inMonths() { return this.value / SECONDS_PER_MONTH; }
  inYears() { return this.value / SECONDS_PER_YEAR; }
  inMilliseconds() { return this.value * 1000; }

  /**
   * "2 days and 3 hours"
   * @returns {string}
   */
  inspect() {
    const entries = Object.entries(this.parts);
    if (entries.length === 0) return `${this.value} seconds`;
    return toSentence(entries.map(([unit, v]) => `${v} ${v === 1 ? unit.slice(0, -1) : unit}`));
  }

  [Symbol.for("nodejs.util.inspect.custom")]() {
    return this.inspect();
  }

  /**
   * "P2DT3H"; precision limits the fractional digits of seconds.
   * @param {{ precision?: number }} [options]
   * @returns {string}
   */
  iso8601({ precision } = {}) {
    return serializeISO8601(this, precision);
  }

  // ---- time arithmetic ---------------------------------------------------

  /**
   * days(1).since(date) — calendar parts advance the calendar; hours,
   * minutes and seconds add elapsed time.
   * @overload
   * @returns {Date}
   */
  /**
   * @template {TimeLike} T
   * @overload
   * @param {T} time
   * @returns {T}
   */
  /**
   * @param {TimeLike} [time]
   * @returns {TimeLike}
   */
  since(time = new Date()) {
    return this.#sum(1, time);
  }

  /**
   * @overload
   * @returns {Date}
   */
  /**
   * @template {TimeLike} T
   * @overload
   * @param {T} time
   * @returns {T}
   */
  /**
   * @param {TimeLike} [time]
   * @returns {TimeLike}
   */
  ago(time = new Date()) {
    return this.#sum(-1, time);
  }

  /** @returns {Date} */
  fromNow() { return this.since(); }
  /**
   * @template {TimeLike} T
   * @param {T} time
   * @returns {T}
   */
  after(time) { return this.since(time); }
  /**
   * @template {TimeLike} T
   * @param {T} time
   * @returns {T}
   */
  until(time) { return this.ago(time); }
  /**
   * @template {TimeLike} T
   * @param {T} time
   * @returns {T}
   */
  before(time) { return this.ago(time); }

  // Accepts a Date or anything with since()/advance(), such as TimeWithZone.
  /**
   * @param {number} sign
   * @param {TimeLike} time
   * @returns {any}
   */
  #sum(sign, time) {
    const isDate = time instanceof Date;
    if (!isDate && !(time && typeof time.since === "function" && typeof time.advance === "function")) {
      throw new TypeError(`expected a time or date, got ${time}`);
    }
    const sinceFn = (t, s) => (isDate ? timeSince(t, s) : t.since(s));
    const advanceFn = (t, opts) => (isDate ? advance(t, opts) : t.advance(opts));
    const entries = Object.entries(this.parts);
    if (entries.length === 0) return sinceFn(time, sign * this.value);
    return entries.reduce((t, [type, number]) => {
      switch (type) {
        case "seconds": return sinceFn(t, sign * number);
        case "minutes": return sinceFn(t, sign * number * 60);
        case "hours": return sinceFn(t, sign * number * 3600);
        default: return advanceFn(t, { [type]: sign * number });
      }
    }, time);
  }
}

// ---- ISO 8601 ----------------------------------------------------------------

const ISO_DATE_COMPONENTS = { Y: "years", M: "months", W: "weeks", D: "days" };
const ISO_TIME_COMPONENTS = { H: "hours", M: "minutes", S: "seconds" };

function parseISO8601(string) {
  const input = String(string);
  const fail = (reason) => {
    throw new ISO8601ParsingError(`Invalid ISO 8601 duration: ${JSON.stringify(input)} ${reason}`);
  };
  const match = input.match(/^([+-])?P(.*)$/);
  if (!match) fail("is not a duration");
  const sign = match[1] === "-" ? -1 : 1;
  let rest = match[2];
  if (rest === "" || rest === "T") fail("is empty duration");

  const parts = {};
  let mode = "date";
  let fractionalSeen = false;
  const token = /^([+-]?\d+(?:[.,]\d+)?)([A-Z])|^T/;
  while (rest.length) {
    const m = rest.match(token);
    if (!m) fail("is invalid");
    if (m[0] === "T") {
      if (mode === "time") fail("has a duplicate T");
      mode = "time";
      rest = rest.slice(1);
      if (rest === "") fail("has an empty time component");
      continue;
    }
    if (fractionalSeen) fail("(only last part can be fractional)");
    const [, rawNumber, designator] = m;
    const key = (mode === "date" ? ISO_DATE_COMPONENTS : ISO_TIME_COMPONENTS)[designator];
    if (!key) fail(`has an invalid ${mode} designator ${designator}`);
    if (parts[key] !== undefined) fail(`has duplicate ${designator}`);
    const number = Number(rawNumber.replace(",", "."));
    if (!Number.isInteger(number)) fractionalSeen = true;
    parts[key] = sign * number;
    rest = rest.slice(m[0].length);
  }

  const value = Object.entries(parts).reduce((sum, [k, v]) => sum + v * PARTS_IN_SECONDS[k], 0);
  return new Duration(value, parts);
}

function serializeISO8601(duration, precision) {
  let parts = { ...duration.parts };
  if (Object.keys(parts).length === 0) parts = { seconds: duration.value };

  // Weeks only stand alone; mixed with other parts they become days.
  if (parts.weeks !== undefined && Object.keys(parts).length > 1) {
    parts.days = (parts.days ?? 0) + parts.weeks * 7;
    delete parts.weeks;
  }

  const fmt = (v) => String(v);
  const fmtSeconds = (v) =>
    precision !== undefined ? v.toFixed(precision) : Number.isInteger(v) ? String(v) : String(roundFloat(v));

  let out = "P";
  if (parts.years) out += `${fmt(parts.years)}Y`;
  if (parts.months) out += `${fmt(parts.months)}M`;
  if (parts.weeks) out += `${fmt(parts.weeks)}W`;
  if (parts.days) out += `${fmt(parts.days)}D`;
  let time = "";
  if (parts.hours) time += `${fmt(parts.hours)}H`;
  if (parts.minutes) time += `${fmt(parts.minutes)}M`;
  if (parts.seconds) time += `${fmtSeconds(parts.seconds)}S`;
  if (time) out += `T${time}`;
  // Signs stay on each part ("P-1DT-2H"), as Rails 8.1 serializes them.
  return out === "P" ? "PT0S" : out;
}

// ---- Numeric constructors (1.day, 2.hours, ...) ----------------------------

/**
 * @param {number} n
 * @returns {Duration}
 */
export const seconds = (n) => Duration.seconds(n);
/**
 * @param {number} n
 * @returns {Duration}
 */
export const minutes = (n) => Duration.minutes(n);
/**
 * @param {number} n
 * @returns {Duration}
 */
export const hours = (n) => Duration.hours(n);
/**
 * @param {number} n
 * @returns {Duration}
 */
export const days = (n) => Duration.days(n);
/**
 * @param {number} n
 * @returns {Duration}
 */
export const weeks = (n) => Duration.weeks(n);
/**
 * @param {number} n
 * @returns {Duration}
 */
export const fortnights = (n) => Duration.weeks(n * 2);
/**
 * @param {number} n
 * @returns {Duration}
 */
export const months = (n) => Duration.months(n);
/**
 * @param {number} n
 * @returns {Duration}
 */
export const years = (n) => Duration.years(n);
/**
 * @param {number} n
 * @returns {Duration}
 */
export const milliseconds = (n) => Duration.seconds(n / 1000);
export const second = seconds;
export const minute = minutes;
export const hour = hours;
export const day = days;
export const week = weeks;
export const fortnight = fortnights;
export const month = months;
export const year = years;
