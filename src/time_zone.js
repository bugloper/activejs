// Ports of ActiveSupport::TimeZone, ActiveSupport::TimeWithZone and the
// Time.zone / Time.current / Time.use_zone API, built on Intl's tz database.
//
//   Time.zone = "Eastern Time (US & Canada)"
//   const t = Time.zone.local(2024, 3, 10, 1, 30)   // months are 1-based
//   t.plus(hours(1)).toString()  // => "2024-03-10 03:30:00 -0400" (across DST)
//   t.plus(days(1)).hour         // => 1 (calendar days keep wall-clock time)
//   Time.useZone("Tokyo", () => Time.current().toString())
//   inTimeZone(new Date(), "Asia/Kolkata").strftime("%H:%M %Z")
import { AsyncLocalStorage } from "node:async_hooks";
import { MAPPING } from "./time_zone_mapping.js";
import { strftime, TIME_FORMATS } from "./core_ext/date.js";

/** @typedef {import("./core_ext/date.js").DayName} DayName */
/** @typedef {import("./core_ext/date.js").AdvanceOptions} AdvanceOptions */
/** @typedef {import("./core_ext/date.js").ChangeOptions & { zone?: string | TimeZone, offset?: string | number }} ZoneChangeOptions */
/** @typedef {{ year: number, month: number, day: number, hour: number, min: number, sec: number, ms: number }} WallFields */
/** @typedef {string | number | TimeZone} ZoneArg */

const MS_PER_HOUR = 3600 * 1000;
const DAYS_INTO_WEEK = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
const mod = (a, n) => ((a % n) + n) % n;
const pad2 = (n) => String(n).padStart(2, "0");

// ---- Intl helpers ---------------------------------------------------------------

const formatters = new Map();
function formatterFor(tz) {
  if (!formatters.has(tz)) {
    formatters.set(tz, new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric",
      hour: "numeric", minute: "numeric", second: "numeric", era: "short",
    }));
  }
  return formatters.get(tz);
}

// Wall-clock fields of an instant in a zone.
function wallParts(tz, ms) {
  const parts = {};
  for (const p of formatterFor(tz).formatToParts(new Date(ms))) parts[p.type] = p.value;
  let year = Number(parts.year);
  if (parts.era === "BC" || parts.era === "B") year = 1 - year;
  return {
    year, month: Number(parts.month), day: Number(parts.day),
    hour: Number(parts.hour) % 24, min: Number(parts.minute), sec: Number(parts.second), ms: mod(ms, 1000),
  };
}

// Wall-clock fields as a "floating" UTC millisecond value.
const floating = ({ year, month, day, hour = 0, min = 0, sec = 0, ms = 0 }) => {
  const d = new Date(0);
  d.setUTCFullYear(year, month - 1, day);
  d.setUTCHours(hour, min, sec, ms);
  return d.getTime();
};

const fieldsOfFloating = (f) => {
  const d = new Date(f);
  return {
    year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(),
    hour: d.getUTCHours(), min: d.getUTCMinutes(), sec: d.getUTCSeconds(), ms: d.getUTCMilliseconds(),
  };
};

function offsetSecondsAt(tz, ms) {
  const whole = Math.floor(ms / 1000) * 1000;
  return (floating({ ...wallParts(tz, whole), ms: 0 }) - whole) / 1000;
}

// Resolves a wall-clock time to an instant. Times in a spring-forward gap
// move forward an hour; ambiguous fall-back times pick the DST (earlier)
// instant, as Rails does.
function localToUtcMs(tz, wall) {
  for (let shift = 0; shift <= 2; shift++) {
    const f = wall + shift * MS_PER_HOUR;
    const offsets = new Set([-1, 0, 1].map((d) => offsetSecondsAt(tz, f + d * 86400000)));
    const candidates = [...offsets]
      .map((o) => f - o * 1000)
      .filter((t) => floating(wallParts(tz, t)) === f);
    if (candidates.length) return Math.min(...candidates);
  }
  return wall - offsetSecondsAt(tz, wall) * 1000;
}

function abbreviation(tz, ms) {
  try {
    const name = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" })
      .formatToParts(new Date(ms))
      .find((p) => p.type === "timeZoneName")?.value;
    if (name === "GMT" && offsetSecondsAt(tz, ms) === 0 && /^(Etc\/)?(UTC|UCT|Zulu|Universal)$/.test(tz)) return "UTC";
    return name ?? tz;
  } catch {
    return tz;
  }
}

function formatOffset(seconds, colon = true, alternateUtcString) {
  if (seconds === 0 && alternateUtcString !== undefined) return alternateUtcString;
  const sign = seconds < 0 ? "-" : "+";
  const abs = Math.abs(seconds);
  const hh = pad2(Math.floor(abs / 3600));
  const mm = pad2(Math.floor((abs % 3600) / 60));
  return `${sign}${hh}${colon ? ":" : ""}${mm}`;
}

// ---- TimeZone -------------------------------------------------------------------

/** @type {Map<string, TimeZone>} */
const zoneCache = new Map();

export class TimeZone {
  /**
   * TimeZone.find("Eastern Time (US & Canada)") / ("America/New_York") / (-5) hours offset
   * @param {ZoneArg} name
   * @returns {TimeZone | undefined}
   */
  static find(name) {
    if (name instanceof TimeZone) return name;
    if (typeof name === "number") {
      const seconds = Math.abs(name) <= 13 ? name * 3600 : name;
      return TimeZone.all().find((z) => z.utcOffset() === seconds);
    }
    if (typeof name !== "string") throw new TypeError(`invalid argument to TimeZone.find: ${name}`);
    if (zoneCache.has(name)) return zoneCache.get(name);
    const tz = MAPPING[name] ?? name;
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: tz });
    } catch {
      return undefined;
    }
    const zone = new TimeZone(name, tz);
    zoneCache.set(name, zone);
    return zone;
  }

  /**
   * @param {ZoneArg} name
   * @returns {TimeZone | undefined}
   */
  static get(name) {
    return TimeZone.find(name);
  }

  /**
   * All Rails-named zones, sorted by offset then name.
   * @returns {TimeZone[]}
   */
  static all() {
    return Object.keys(MAPPING)
      .map((n) => TimeZone.find(n))
      .sort((a, b) => a.utcOffset() - b.utcOffset() || a.name.localeCompare(b.name));
  }

  /** @returns {TimeZone[]} */
  static usZones() {
    const us = new Set(["Hawaii", "Alaska", "Pacific Time (US & Canada)", "Arizona", "Mountain Time (US & Canada)",
      "Central Time (US & Canada)", "Eastern Time (US & Canada)", "Indiana (East)"]);
    return TimeZone.all().filter((z) => us.has(z.name));
  }

  /** @returns {Record<string, string>} */
  static get MAPPING() {
    return MAPPING;
  }

  /**
   * @param {string} name
   * @param {string} [tzinfo]
   */
  constructor(name, tzinfo = MAPPING[name] ?? name) {
    /** @type {string} */
    this.name = name;
    /** @type {string} IANA identifier */
    this.tzinfo = tzinfo;
    Object.freeze(this);
  }

  /**
   * Standard (non-DST) offset in seconds.
   * @returns {number}
   */
  utcOffset() {
    const year = new Date().getUTCFullYear();
    return Math.min(
      offsetSecondsAt(this.tzinfo, Date.UTC(year, 0, 1)),
      offsetSecondsAt(this.tzinfo, Date.UTC(year, 6, 1)),
    );
  }

  /**
   * @param {boolean} [colon]
   * @param {string} [alternateUtcString]
   * @returns {string}
   */
  formattedOffset(colon = true, alternateUtcString) {
    return formatOffset(this.utcOffset(), colon, alternateUtcString);
  }

  toString() {
    return `(GMT${this.formattedOffset()}) ${this.name}`;
  }

  /**
   * Offset in seconds at a specific instant (DST-aware).
   * @param {Date | number} instant
   * @returns {number}
   */
  offsetAt(instant) {
    return offsetSecondsAt(this.tzinfo, instant instanceof Date ? instant.getTime() : Number(instant));
  }

  /** @returns {TimeWithZone} */
  now() {
    return new TimeWithZone(Date.now(), this);
  }

  /** @returns {TimeWithZone} */
  today() {
    return this.now().beginningOfDay();
  }

  tomorrow() {
    return this.today().advance({ days: 1 });
  }

  yesterday() {
    return this.today().advance({ days: -1 });
  }

  /**
   * local(2024, 3, 10, 1, 30) — month is 1-based.
   * @param {number} year
   * @param {number} [month] 1-based
   * @param {number} [day]
   * @param {number} [hour]
   * @param {number} [min]
   * @param {number} [sec]
   * @param {number} [ms]
   * @returns {TimeWithZone}
   */
  local(year, month = 1, day = 1, hour = 0, min = 0, sec = 0, ms = 0) {
    return this.#fromWall(floating({ year, month, day, hour, min, sec, ms }));
  }

  /**
   * at(unixSeconds)
   * @param {number} seconds
   * @returns {TimeWithZone}
   */
  at(seconds) {
    return new TimeWithZone(Number(seconds) * 1000, this);
  }

  /**
   * Parses a string. Strings with an explicit offset or "Z" keep that
   * instant; anything else is read as wall-clock time in this zone.
   * @param {string} string
   * @param {TimeWithZone} [now]
   * @returns {TimeWithZone}
   */
  parse(string, now = this.now()) {
    const s = String(string).trim();
    const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s](\d{1,2}):(\d{2})(?::(\d{2})(?:[.,](\d+))?)?)?\s*(Z|UTC|[+-]\d{2}(?::?\d{2})?)?$/i);
    if (m) {
      const [, y, mo, d, h = "0", mi = "0", sec = "0", frac = "0", zone] = m;
      const ms = Math.round(Number(`0.${frac}`) * 1000);
      const wall = floating({ year: +y, month: +mo, day: +d, hour: +h, min: +mi, sec: +sec, ms });
      if (!zone) return this.#fromWall(wall);
      return new TimeWithZone(wall - parseOffset(zone) * 1000, this);
    }
    const timeOnly = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (timeOnly) {
      return this.local(now.year, now.month, now.day, +timeOnly[1], +timeOnly[2], +(timeOnly[3] ?? 0));
    }
    const parsed = Date.parse(s);
    if (Number.isNaN(parsed)) throw new RangeError(`invalid date: ${string}`);
    return new TimeWithZone(parsed, this);
  }

  /**
   * Strict ISO 8601 parsing; throws on anything else.
   * @param {string} string
   * @returns {TimeWithZone}
   */
  iso8601(string) {
    if (!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/.test(String(string).trim())) {
      throw new RangeError(`invalid date: ${string}`);
    }
    return this.parse(string);
  }

  /**
   * Converts a Date (an instant) into this zone.
   * @param {Date | number} date
   * @returns {TimeWithZone}
   */
  utcToLocal(date) {
    return new TimeWithZone(date instanceof Date ? date.getTime() : Number(date), this);
  }

  /**
   * Treats the Date's UTC fields as wall-clock time in this zone.
   * @param {Date} date
   * @returns {Date}
   */
  localToUtc(date) {
    return new Date(localToUtcMs(this.tzinfo, date.getTime()));
  }

  /**
   * @param {number} wall
   * @returns {TimeWithZone}
   */
  #fromWall(wall) {
    return new TimeWithZone(localToUtcMs(this.tzinfo, wall), this);
  }

  /**
   * Internal: resolve wall-clock fields for TimeWithZone.
   * @param {number} wall
   * @returns {TimeWithZone}
   */
  fromWall(wall) {
    return this.#fromWall(wall);
  }
}

function parseOffset(zone) {
  if (/^(Z|UTC)$/i.test(zone)) return 0;
  const m = zone.match(/^([+-])(\d{2}):?(\d{2})?$/);
  const sign = m[1] === "-" ? -1 : 1;
  return sign * (Number(m[2]) * 3600 + Number(m[3] ?? 0) * 60);
}

// ---- TimeWithZone ---------------------------------------------------------------

// An instant paired with a zone. Exposes the same getters as Date
// (getFullYear, getHours, ... in zone time), so strftime/toFormattedS accept it.
export class TimeWithZone {
  /**
   * @param {Date | number} utcMs
   * @param {ZoneArg} zone
   */
  constructor(utcMs, zone) {
    /** @type {number} */
    this.utcMs = utcMs instanceof Date ? utcMs.getTime() : Number(utcMs);
    /** @type {TimeZone} */
    this.timeZone = TimeZone.find(zone);
    if (!this.timeZone) throw new TypeError(`Invalid time zone: ${zone}`);
    /** @type {WallFields} */
    this.fields = wallParts(this.timeZone.tzinfo, this.utcMs);
    Object.freeze(this);
  }

  // ---- fields (month is 1-based like Ruby) ----
  get year() { return this.fields.year; }
  get month() { return this.fields.month; }
  get mon() { return this.fields.month; }
  get day() { return this.fields.day; }
  get mday() { return this.fields.day; }
  get hour() { return this.fields.hour; }
  get min() { return this.fields.min; }
  get sec() { return this.fields.sec; }
  get ms() { return this.fields.ms; }
  get wday() { return new Date(floating(this.fields)).getUTCDay(); }
  get yday() { return Math.round((floating({ ...this.fields, hour: 0, min: 0, sec: 0, ms: 0 }) - floating({ year: this.year, month: 1, day: 1 })) / 86400000) + 1; }

  // Date-compatible getters, so date.js formatting works on TimeWithZone.
  getFullYear() { return this.year; }
  getMonth() { return this.month - 1; }
  getDate() { return this.day; }
  getDay() { return this.wday; }
  getHours() { return this.hour; }
  getMinutes() { return this.min; }
  getSeconds() { return this.sec; }
  getMilliseconds() { return this.ms; }
  getTime() { return this.utcMs; }
  getTimezoneOffset() { return -this.utcOffset() / 60; }
  valueOf() { return this.utcMs; }

  utcOffset() { return offsetSecondsAt(this.timeZone.tzinfo, this.utcMs); }
  get gmtOffset() { return this.utcOffset(); }
  /**
   * The alternate string (e.g. "UTC") is only used when the zone is UTC
   * itself, not merely at offset zero.
   * @param {boolean} [colon]
   * @param {string} [alternateUtcString]
   * @returns {string}
   */
  formattedOffset(colon = true, alternateUtcString) {
    if (this.isUtc() && alternateUtcString !== undefined) return alternateUtcString;
    return formatOffset(this.utcOffset(), colon);
  }
  /** @returns {string} */
  zone() { return abbreviation(this.timeZone.tzinfo, this.utcMs); }
  zoneAbbreviation() { return this.zone(); }
  /** @returns {boolean} */
  isDst() { return this.utcOffset() > this.timeZone.utcOffset(); }
  /** @returns {boolean} */
  isUtc() { return ["UTC", "Etc/UTC", "Etc/UCT", "UCT"].includes(this.timeZone.tzinfo); }

  // ---- conversions ----
  utc() { return new Date(this.utcMs); }
  toDate() { return new Date(this.utcMs); }
  toTime() { return new Date(this.utcMs); }
  toI() { return Math.floor(this.utcMs / 1000); }
  toF() { return this.utcMs / 1000; }
  /**
   * @param {ZoneArg} [zone]
   * @returns {TimeWithZone | Date}
   */
  inTimeZone(zone = Time.zone) { return zone ? new TimeWithZone(this.utcMs, zone) : new Date(this.utcMs); }
  localtime() { return new Date(this.utcMs); }

  /**
   * @param {string} format
   * @returns {string}
   */
  strftime(format) { return strftime(this, format); }
  /**
   * @param {string} [format]
   * @returns {string}
   */
  toFormattedS(format = "default") {
    if (format === "db") return utcDb(this.utcMs); // Rails formats :db in UTC
    const formatter = TIME_FORMATS[format];
    if (formatter === undefined) return this.toString();
    return typeof formatter === "function" ? formatter(this) : strftime(this, formatter);
  }
  /**
   * @param {string} [format]
   * @returns {string}
   */
  toFs(format) { return this.toFormattedS(format); }

  // "2024-01-31 15:30:45 -0500"
  toString() { return `${strftime(this, "%Y-%m-%d %H:%M:%S")} ${this.formattedOffset(false, "UTC")}`; }
  // "Wed, 31 Jan 2024 15:30:45.123000000 EST -05:00"
  inspect() { return `${strftime(this, "%a, %d %b %Y %H:%M:%S.%9N")} ${this.zone()} ${this.formattedOffset()}`; }
  [Symbol.for("nodejs.util.inspect.custom")]() { return this.inspect(); }

  /**
   * @param {number} [fractionDigits]
   * @returns {string}
   */
  xmlschema(fractionDigits = 0) {
    const fraction = fractionDigits > 0 ? `.${strftime(this, `%${fractionDigits}N`)}` : "";
    return `${strftime(this, "%Y-%m-%dT%H:%M:%S")}${fraction}${this.isUtc() ? "Z" : this.formattedOffset(true)}`;
  }
  /**
   * @param {number} [fractionDigits]
   * @returns {string}
   */
  iso8601(fractionDigits) { return this.xmlschema(fractionDigits); }
  rfc2822() { return strftime(this, "%a, %d %b %Y %H:%M:%S ") + this.formattedOffset(false); }
  httpdate() { return this.utc().toUTCString(); }
  asJson() { return this.xmlschema(3); }
  toJSON() { return this.asJson(); }

  // ---- arithmetic ----
  /**
   * @param {number | { valueOf(): number }} seconds
   * @returns {TimeWithZone}
   */
  since(seconds) { return new TimeWithZone(this.utcMs + Math.round(Number(seconds) * 1000), this.timeZone); }
  /**
   * @param {number | { valueOf(): number }} seconds
   * @returns {TimeWithZone}
   */
  ago(seconds) { return this.since(-Number(seconds)); }
  /**
   * @param {number | { valueOf(): number }} seconds
   * @returns {TimeWithZone}
   */
  inTime(seconds) { return this.since(seconds); }

  /**
   * plus(days(1)) / plus(60) (seconds)
   * @param {import("./duration.js").Duration | number} other
   * @returns {TimeWithZone}
   */
  plus(other) {
    if (typeof other !== "number" && other && typeof other.since === "function" && !(other instanceof TimeWithZone)) return other.since(this);
    return this.since(Number(other));
  }

  /**
   * minus(hours(1)) => TimeWithZone; minus(otherTime) => seconds between
   * @overload
   * @param {TimeWithZone | Date} other
   * @returns {number}
   */
  /**
   * @overload
   * @param {import("./duration.js").Duration | number} other
   * @returns {TimeWithZone}
   */
  /**
   * @param {TimeWithZone | Date | import("./duration.js").Duration | number} other
   * @returns {TimeWithZone | number}
   */
  minus(other) {
    if (other instanceof TimeWithZone || other instanceof Date) return (this.utcMs - other.getTime()) / 1000;
    if (typeof other !== "number" && other && typeof other.ago === "function") return other.ago(this);
    return this.ago(Number(other));
  }

  /**
   * Calendar units move wall-clock time; hours/minutes/seconds move the instant.
   * @param {AdvanceOptions} [options]
   * @returns {TimeWithZone}
   */
  advance(options = {}) {
    const { years = 0, months = 0, weeks = 0, days = 0, hours = 0, minutes = 0, seconds = 0 } = options;
    if (!(years || months || weeks || days)) {
      return this.since(hours * 3600 + minutes * 60 + seconds);
    }
    let f = { ...this.fields };
    if (years || months) {
      const total = f.month - 1 + Math.trunc(months) + Math.trunc(years) * 12;
      const year = f.year + Math.floor(total / 12);
      const month = mod(total, 12) + 1;
      f = { ...f, year, month, day: Math.min(f.day, daysInMonth(year, month)) };
    }
    let wall = floating(f);
    const totalDays = weeks * 7 + days;
    wall += Math.floor(totalDays) * 86400000;
    wall += Math.round(((totalDays - Math.floor(totalDays)) * 86400 + hours * 3600 + minutes * 60 + seconds) * 1000);
    return this.timeZone.fromWall(wall);
  }

  /**
   * change({ hour: 0 }) resets smaller units, like Rails.
   * @param {ZoneChangeOptions} [options]
   * @returns {TimeWithZone}
   */
  change(options = {}) {
    const f = this.fields;
    const next = {
      year: options.year ?? f.year,
      month: options.month ?? f.month,
      day: options.day ?? f.day,
      hour: options.hour ?? f.hour,
      min: options.min ?? (options.hour !== undefined ? 0 : f.min),
      sec: options.sec ?? (options.hour !== undefined || options.min !== undefined ? 0 : f.sec),
      ms: options.ms ?? (options.hour !== undefined || options.min !== undefined || options.sec !== undefined ? 0 : f.ms),
    };
    if (options.offset !== undefined && options.zone !== undefined) {
      throw new TypeError("Can't change both offset and zone at the same time");
    }
    // Like Rails, keep the wall-clock time and resolve it in the new zone; an
    // offset ("+09:00" or seconds) picks the first zone with that UTC offset.
    let zone = this.timeZone;
    if (options.zone !== undefined) zone = findOrThrow(options.zone);
    if (options.offset !== undefined) {
      const seconds = typeof options.offset === "number" ? options.offset : parseOffset(String(options.offset));
      zone = TimeZone.all().find((z) => z.utcOffset() === seconds);
      if (!zone) throw new TypeError(`No time zone with offset ${options.offset}`);
    }
    return zone.fromWall(floating(next));
  }

  // ---- calculations ----
  beginningOfDay() { return this.change({ hour: 0 }); }
  midnight() { return this.beginningOfDay(); }
  middleOfDay() { return this.change({ hour: 12 }); }
  endOfDay() { return this.change({ hour: 23, min: 59, sec: 59, ms: 999 }); }
  beginningOfHour() { return this.change({ min: 0 }); }
  endOfHour() { return this.change({ min: 59, sec: 59, ms: 999 }); }
  beginningOfMinute() { return this.change({ sec: 0 }); }
  endOfMinute() { return this.change({ sec: 59, ms: 999 }); }
  /**
   * @param {DayName} [startDay]
   * @returns {TimeWithZone}
   */
  beginningOfWeek(startDay = "monday") {
    return this.advance({ days: -mod(this.wday - DAYS_INTO_WEEK[startDay], 7) }).beginningOfDay();
  }
  /**
   * @param {DayName} [startDay]
   * @returns {TimeWithZone}
   */
  endOfWeek(startDay = "monday") { return this.beginningOfWeek(startDay).advance({ days: 6 }).endOfDay(); }
  beginningOfMonth() { return this.change({ day: 1, hour: 0 }); }
  endOfMonth() { return this.change({ day: daysInMonth(this.year, this.month) }).endOfDay(); }
  beginningOfQuarter() { return this.change({ month: Math.floor((this.month - 1) / 3) * 3 + 1, day: 1, hour: 0 }); }
  endOfQuarter() {
    const month = Math.floor((this.month - 1) / 3) * 3 + 3;
    return this.change({ month, day: daysInMonth(this.year, month) }).endOfDay();
  }
  beginningOfYear() { return this.change({ month: 1, day: 1, hour: 0 }); }
  endOfYear() { return this.change({ month: 12, day: 31 }).endOfDay(); }
  yesterday() { return this.advance({ days: -1 }); }
  tomorrow() { return this.advance({ days: 1 }); }
  /**
   * @param {number} [n]
   * @returns {TimeWithZone}
   */
  nextDay(n = 1) { return this.advance({ days: n }); }
  /**
   * @param {number} [n]
   * @returns {TimeWithZone}
   */
  prevDay(n = 1) { return this.advance({ days: -n }); }
  /**
   * @param {number} [n]
   * @returns {TimeWithZone}
   */
  nextMonth(n = 1) { return this.advance({ months: n }); }
  /**
   * @param {number} [n]
   * @returns {TimeWithZone}
   */
  prevMonth(n = 1) { return this.advance({ months: -n }); }
  /**
   * @param {number} [n]
   * @returns {TimeWithZone}
   */
  nextYear(n = 1) { return this.advance({ years: n }); }
  /**
   * @param {number} [n]
   * @returns {TimeWithZone}
   */
  prevYear(n = 1) { return this.advance({ years: -n }); }
  /** @returns {[TimeWithZone, TimeWithZone]} */
  allDay() { return [this.beginningOfDay(), this.endOfDay()]; }
  /**
   * @param {DayName} [startDay]
   * @returns {[TimeWithZone, TimeWithZone]}
   */
  allWeek(startDay) { return [this.beginningOfWeek(startDay), this.endOfWeek(startDay)]; }
  /** @returns {[TimeWithZone, TimeWithZone]} */
  allMonth() { return [this.beginningOfMonth(), this.endOfMonth()]; }
  /** @returns {[TimeWithZone, TimeWithZone]} */
  allYear() { return [this.beginningOfYear(), this.endOfYear()]; }
  secondsSinceMidnight() { return (this.utcMs - this.beginningOfDay().utcMs) / 1000; }

  isToday() { return sameWallDay(this, this.timeZone.now()); }
  isTomorrow() { return sameWallDay(this, this.timeZone.now().tomorrow()); }
  isYesterday() { return sameWallDay(this, this.timeZone.now().yesterday()); }
  isPast() { return this.utcMs < Date.now(); }
  isFuture() { return this.utcMs > Date.now(); }
  isWeekend() { return this.wday === 0 || this.wday === 6; }

  /**
   * @param {{ getTime?: () => number } | null | undefined} other
   * @returns {boolean}
   */
  equals(other) { return other != null && typeof other.getTime === "function" && other.getTime() === this.utcMs; }
  /**
   * @param {{ getTime(): number }} other
   * @returns {number}
   */
  compareTo(other) { return Math.sign(this.utcMs - other.getTime()); }
  /**
   * @param {{ getTime(): number }} other
   * @returns {boolean}
   */
  isBefore(other) { return this.utcMs < other.getTime(); }
  /**
   * @param {{ getTime(): number }} other
   * @returns {boolean}
   */
  isAfter(other) { return this.utcMs > other.getTime(); }
}

const sameWallDay = (a, b) => a.year === b.year && a.month === b.month && a.day === b.day;
// Day 0 of the following month is the last day of this one.
const daysInMonth = (year, month) => fieldsOfFloating(floating({ year, month: month + 1, day: 0 })).day;
const utcDb = (ms) => {
  const f = fieldsOfFloating(ms);
  return `${f.year}-${pad2(f.month)}-${pad2(f.day)} ${pad2(f.hour)}:${pad2(f.min)}:${pad2(f.sec)}`;
};

// ---- Time.zone ------------------------------------------------------------------

/** @type {AsyncLocalStorage<TimeZone>} */
const zoneStorage = new AsyncLocalStorage();
/** @type {TimeZone | undefined} */
let defaultZone;

// Time.zone, Time.current, Time.useZone — mirrors Rails' Time class methods.
export const Time = {
  /** @returns {TimeZone | undefined} */
  get zone() {
    return zoneStorage.getStore() ?? defaultZone;
  },
  /** @param {ZoneArg | null | undefined} value */
  set zone(value) {
    defaultZone = value === null || value === undefined ? undefined : findOrThrow(value);
  },
  /** @returns {TimeZone | undefined} */
  get zoneDefault() { return defaultZone; },

  /**
   * Runs fn with Time.zone set to `zone` for its async context only.
   * @template T
   * @param {ZoneArg} zone
   * @param {() => T} fn
   * @returns {T}
   */
  useZone(zone, fn) {
    return zoneStorage.run(findOrThrow(zone), fn);
  },

  /**
   * @param {ZoneArg} zone
   * @returns {TimeZone | undefined}
   */
  findZone(zone) { return TimeZone.find(zone); },
  /**
   * @param {ZoneArg} zone
   * @returns {TimeZone}
   */
  findZoneBang(zone) { return findOrThrow(zone); },

  /**
   * Time.zone.now when a zone is set, otherwise a plain Date.
   * @returns {TimeWithZone | Date}
   */
  current() {
    const zone = Time.zone;
    return zone ? zone.now() : new Date();
  },

  /**
   * Today's date in Time.zone (or local time), at midnight.
   * @returns {TimeWithZone | Date}
   */
  today() {
    const zone = Time.zone;
    if (zone) return zone.today();
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  },
};

function findOrThrow(zone) {
  const found = TimeZone.find(zone);
  if (!found) throw new TypeError(`Invalid Timezone: ${zone}`);
  return found;
}

/**
 * inTimeZone(new Date(), "Hawaii") => TimeWithZone
 * @param {Date} date
 * @param {ZoneArg} [zone]
 * @returns {TimeWithZone | Date}
 */
export function inTimeZone(date, zone = Time.zone) {
  if (!zone) return date;
  return new TimeWithZone(date.getTime(), zone);
}
