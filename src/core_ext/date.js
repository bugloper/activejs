// Port of active_support/core_ext/date, core_ext/time and
// core_ext/date_and_time (calculations, conversions, zones-free).
//
// JS has a single Date type, so these functions work on Date instances in the
// host's local time zone, the way Ruby's Time does without Time.zone. Every
// function returns a new Date; inputs are never mutated.
//
// Month numbers in option objects are 1-based, like Ruby (change(d, { month: 1 })
// is January), even though Date#getMonth() is 0-based.
import { ordinalize } from "../inflector/methods.js";

/** @typedef {"sunday" | "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday"} DayName */

/**
 * A Date, or anything with Date-style getters such as TimeWithZone.
 * @typedef {object} DateLike
 * @property {() => number} getFullYear
 * @property {() => number} getMonth
 * @property {() => number} getDate
 * @property {() => number} getDay
 * @property {() => number} getHours
 * @property {() => number} getMinutes
 * @property {() => number} getSeconds
 * @property {() => number} getMilliseconds
 * @property {() => number} getTime
 * @property {() => number} getTimezoneOffset
 * @property {() => string} [zone]
 */

/**
 * Fields for change(); month is 1-based.
 * @typedef {{ year?: number, month?: number, day?: number, hour?: number, min?: number, sec?: number, ms?: number }} ChangeOptions
 */

/**
 * @typedef {{ years?: number, months?: number, weeks?: number, days?: number, hours?: number, minutes?: number, seconds?: number }} AdvanceOptions
 */

/** @typedef {string | ((d: DateLike) => string)} Formatter */

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
/** @type {Record<DayName, number>} */
const DAYS_INTO_WEEK = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
const WEEKEND_DAYS = [0, 6];

/** @type {DayName} */
let beginningOfWeekDefault = "monday";

/**
 * Sets the default start of the week, like Date.beginning_of_week = :sunday.
 * @param {DayName} day
 * @returns {void}
 */
export function setBeginningOfWeek(day) {
  if (!(day in DAYS_INTO_WEEK)) throw new TypeError(`Invalid beginning of week: ${day}`);
  beginningOfWeekDefault = day;
}
/** @returns {DayName} */
export const getBeginningOfWeek = () => beginningOfWeekDefault;

const current = () => new Date();
const mod = (a, n) => ((a % n) + n) % n;

/**
 * new Date(y, m, ...) maps years 0-99 to 1900-1999; this doesn't.
 * @param {number} year
 * @param {number} monthIndex
 * @param {number} [day]
 * @param {number} [hour]
 * @param {number} [min]
 * @param {number} [sec]
 * @param {number} [ms]
 * @returns {Date}
 */
export function makeDate(year, monthIndex, day = 1, hour = 0, min = 0, sec = 0, ms = 0) {
  const d = new Date(2000, 0, 1, hour, min, sec, ms);
  d.setFullYear(year, monthIndex, day);
  d.setHours(hour, min, sec, ms);
  return d;
}

const copy = (d) => new Date(d.getTime());

/**
 * @param {number} month 1-based
 * @param {number} [year]
 * @returns {number}
 */
export function daysInMonth(month, year = current().getFullYear()) {
  // month is 1-based; day 0 of the following month is the last day of this one.
  return makeDate(year, month, 0).getDate();
}

/**
 * @param {number} year
 * @returns {boolean}
 */
export const isLeapYear = (year) => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
/**
 * @param {number} [year]
 * @returns {number}
 */
export const daysInYear = (year = current().getFullYear()) => (isLeapYear(year) ? 366 : 365);

// ---- change / advance -------------------------------------------------------

/**
 * change(t, { hour: 10 }) resets minutes/seconds; change(t, { min: 5 }) resets seconds.
 * @param {Date} date
 * @param {ChangeOptions} [options]
 * @returns {Date}
 */
export function change(date, options = {}) {
  const year = options.year ?? date.getFullYear();
  const month = options.month ?? date.getMonth() + 1;
  const day = options.day ?? date.getDate();
  const hour = options.hour ?? date.getHours();
  const min = options.min ?? (options.hour !== undefined ? 0 : date.getMinutes());
  const sec = options.sec ?? (options.hour !== undefined || options.min !== undefined ? 0 : date.getSeconds());
  const ms = options.ms ??
    (options.hour !== undefined || options.min !== undefined || options.sec !== undefined ? 0 : date.getMilliseconds());
  return makeDate(year, month - 1, day, hour, min, sec, ms);
}

/**
 * advance(t, { years: 1, months: 2, weeks: 1, days: 3, hours: 4, minutes: 5, seconds: 6 })
 * Years/months/weeks/days move by calendar (Jan 31 + 1 month => Feb 28/29);
 * hours/minutes/seconds move by elapsed time.
 * @param {Date} date
 * @param {AdvanceOptions} [options]
 * @returns {Date}
 */
export function advance(date, options = {}) {
  let { years = 0, months = 0, weeks = 0, days = 0, hours = 0, minutes = 0, seconds = 0 } = options;

  const partialWeeks = weeks - Math.floor(weeks);
  weeks = Math.floor(weeks);
  days += 7 * partialWeeks;
  const partialDays = days - Math.floor(days);
  days = Math.floor(days);
  hours += 24 * partialDays;

  let d = copy(date);
  if (years || months) {
    const totalMonths = d.getMonth() + Math.trunc(months) + Math.trunc(years) * 12;
    const year = d.getFullYear() + Math.floor(totalMonths / 12);
    const monthIndex = mod(totalMonths, 12);
    const day = Math.min(d.getDate(), daysInMonth(monthIndex + 1, year));
    d = makeDate(year, monthIndex, day, d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds());
  }
  if (weeks || days) d.setDate(d.getDate() + weeks * 7 + days);
  const elapsed = hours * 3600 + minutes * 60 + seconds;
  if (elapsed) d = new Date(d.getTime() + Math.round(elapsed * 1000));
  return d;
}

/**
 * since(t, 60) // one minute after t
 * @param {Date} date
 * @param {number | { valueOf(): number }} seconds
 * @returns {Date}
 */
export const since = (date, seconds) => new Date(date.getTime() + Math.round(Number(seconds) * 1000));
/**
 * @param {Date} date
 * @param {number | { valueOf(): number }} seconds
 * @returns {Date}
 */
export const ago = (date, seconds) => since(date, -Number(seconds));
export const inTime = since;

// ---- beginning/end ----------------------------------------------------------

/**
 * @param {Date} d
 * @returns {Date}
 */
export const beginningOfDay = (d) => change(d, { hour: 0 });
/**
 * @param {Date} d
 * @returns {Date}
 */
export const middleOfDay = (d) => change(d, { hour: 12 });
/**
 * @param {Date} d
 * @returns {Date}
 */
export const endOfDay = (d) => change(d, { hour: 23, min: 59, sec: 59, ms: 999 });
/**
 * @param {Date} d
 * @returns {Date}
 */
export const beginningOfHour = (d) => change(d, { min: 0 });
/**
 * @param {Date} d
 * @returns {Date}
 */
export const endOfHour = (d) => change(d, { min: 59, sec: 59, ms: 999 });
/**
 * @param {Date} d
 * @returns {Date}
 */
export const beginningOfMinute = (d) => change(d, { sec: 0 });
/**
 * @param {Date} d
 * @returns {Date}
 */
export const endOfMinute = (d) => change(d, { sec: 59, ms: 999 });
export const midnight = beginningOfDay;
export const atBeginningOfDay = beginningOfDay;
export const noon = middleOfDay;

/**
 * @param {Date} d
 * @param {DayName} [startDay]
 * @returns {number}
 */
export function daysToWeekStart(d, startDay = beginningOfWeekDefault) {
  const startIndex = DAYS_INTO_WEEK[startDay];
  if (startIndex === undefined) throw new TypeError(`Invalid start day: ${startDay}`);
  return mod(d.getDay() - startIndex, 7);
}

/**
 * @param {Date} d
 * @param {DayName} [startDay]
 * @returns {Date}
 */
export function beginningOfWeek(d, startDay = beginningOfWeekDefault) {
  return beginningOfDay(advance(d, { days: -daysToWeekStart(d, startDay) }));
}
/**
 * @param {Date} d
 * @returns {Date}
 */
export const monday = (d) => beginningOfWeek(d, "monday");

/**
 * @param {Date} d
 * @param {DayName} [startDay]
 * @returns {Date}
 */
export function endOfWeek(d, startDay = beginningOfWeekDefault) {
  return endOfDay(advance(beginningOfWeek(d, startDay), { days: 6 }));
}
/**
 * @param {Date} d
 * @returns {Date}
 */
export const sunday = (d) => endOfWeek(d, "monday");

/**
 * @param {Date} d
 * @returns {Date}
 */
export const beginningOfMonth = (d) => change(d, { day: 1, hour: 0 });
/**
 * @param {Date} d
 * @returns {Date}
 */
export const endOfMonth = (d) =>
  endOfDay(change(d, { day: daysInMonth(d.getMonth() + 1, d.getFullYear()) }));

/**
 * @param {Date} d
 * @returns {Date}
 */
export function beginningOfQuarter(d) {
  const firstMonth = Math.floor(d.getMonth() / 3) * 3 + 1;
  return beginningOfMonth(change(d, { month: firstMonth, day: 1 }));
}
/**
 * @param {Date} d
 * @returns {Date}
 */
export function endOfQuarter(d) {
  const lastMonth = Math.floor(d.getMonth() / 3) * 3 + 3;
  return endOfMonth(change(d, { month: lastMonth, day: 1 }));
}
/**
 * @param {Date} d
 * @returns {number}
 */
export const quarter = (d) => Math.floor(d.getMonth() / 3) + 1;

/**
 * @param {Date} d
 * @returns {Date}
 */
export const beginningOfYear = (d) => change(d, { month: 1, day: 1, hour: 0 });
/**
 * @param {Date} d
 * @returns {Date}
 */
export const endOfYear = (d) => endOfDay(change(d, { month: 12, day: 31 }));

// ---- relative navigation ---------------------------------------------------

/**
 * @param {Date} [d]
 * @returns {Date}
 */
export const yesterday = (d = current()) => advance(d, { days: -1 });
/**
 * @param {Date} [d]
 * @returns {Date}
 */
export const tomorrow = (d = current()) => advance(d, { days: 1 });
/**
 * @param {Date} d
 * @param {number} [days]
 * @returns {Date}
 */
export const prevDay = (d, days = 1) => advance(d, { days: -days });
/**
 * @param {Date} d
 * @param {number} [days]
 * @returns {Date}
 */
export const nextDay = (d, days = 1) => advance(d, { days });
/**
 * @param {Date} d
 * @param {number} days
 * @returns {Date}
 */
export const daysAgo = (d, days) => advance(d, { days: -days });
/**
 * @param {Date} d
 * @param {number} days
 * @returns {Date}
 */
export const daysSince = (d, days) => advance(d, { days });
/**
 * @param {Date} d
 * @param {number} weeks
 * @returns {Date}
 */
export const weeksAgo = (d, weeks) => advance(d, { weeks: -weeks });
/**
 * @param {Date} d
 * @param {number} weeks
 * @returns {Date}
 */
export const weeksSince = (d, weeks) => advance(d, { weeks });
/**
 * @param {Date} d
 * @param {number} months
 * @returns {Date}
 */
export const monthsAgo = (d, months) => advance(d, { months: -months });
/**
 * @param {Date} d
 * @param {number} months
 * @returns {Date}
 */
export const monthsSince = (d, months) => advance(d, { months });
/**
 * @param {Date} d
 * @param {number} years
 * @returns {Date}
 */
export const yearsAgo = (d, years) => advance(d, { years: -years });
/**
 * @param {Date} d
 * @param {number} years
 * @returns {Date}
 */
export const yearsSince = (d, years) => advance(d, { years });
/**
 * @param {Date} d
 * @param {number} [months]
 * @returns {Date}
 */
export const prevMonth = (d, months = 1) => advance(d, { months: -months });
/**
 * @param {Date} d
 * @param {number} [months]
 * @returns {Date}
 */
export const nextMonth = (d, months = 1) => advance(d, { months });
export const lastMonth = prevMonth;
/**
 * @param {Date} d
 * @returns {Date}
 */
export const prevQuarter = (d) => advance(d, { months: -3 });
/**
 * @param {Date} d
 * @returns {Date}
 */
export const nextQuarter = (d) => advance(d, { months: 3 });
/**
 * @param {Date} d
 * @param {number} [years]
 * @returns {Date}
 */
export const prevYear = (d, years = 1) => advance(d, { years: -years });
/**
 * @param {Date} d
 * @param {number} [years]
 * @returns {Date}
 */
export const nextYear = (d, years = 1) => advance(d, { years });
export const lastYear = prevYear;

/**
 * nextWeek(d) // => beginning of next week (Monday by default)
 * nextWeek(d, "friday") // => Friday of next week, at the start of the day
 * Pass { sameTime: true } to keep the time of day.
 * @param {Date} d
 * @param {DayName} [givenDay]
 * @param {{ sameTime?: boolean }} [options]
 * @returns {Date}
 */
export function nextWeek(d, givenDay = beginningOfWeekDefault, { sameTime = false } = {}) {
  const target = advance(beginningOfWeek(d), { weeks: 1, days: daysSpan(givenDay) });
  return sameTime ? copyTimeOfDay(target, d) : target;
}
/**
 * @param {Date} d
 * @param {DayName} [startDay]
 * @param {{ sameTime?: boolean }} [options]
 * @returns {Date}
 */
export function prevWeek(d, startDay = beginningOfWeekDefault, { sameTime = false } = {}) {
  const target = advance(beginningOfWeek(d), { weeks: -1, days: daysSpan(startDay) });
  return sameTime ? copyTimeOfDay(target, d) : target;
}
export const lastWeek = prevWeek;

const daysSpan = (day) => mod(DAYS_INTO_WEEK[day] - DAYS_INTO_WEEK[beginningOfWeekDefault], 7);
const copyTimeOfDay = (target, src) =>
  change(target, { hour: src.getHours(), min: src.getMinutes(), sec: src.getSeconds(), ms: src.getMilliseconds() });

/**
 * nextOccurring(d, "friday") // the next Friday strictly after d, same time of day
 * @param {Date} d
 * @param {DayName} dayOfWeek
 * @returns {Date}
 */
export function nextOccurring(d, dayOfWeek) {
  const from = d.getDay();
  const to = DAYS_INTO_WEEK[dayOfWeek];
  let diff = to - from;
  if (diff <= 0) diff += 7;
  return advance(d, { days: diff });
}
/**
 * @param {Date} d
 * @param {DayName} dayOfWeek
 * @returns {Date}
 */
export function prevOccurring(d, dayOfWeek) {
  const from = d.getDay();
  const to = DAYS_INTO_WEEK[dayOfWeek];
  let diff = from - to;
  if (diff <= 0) diff += 7;
  return advance(d, { days: -diff });
}

/**
 * @param {Date} d
 * @returns {Date}
 */
export const nextWeekday = (d) => {
  let n = advance(d, { days: 1 });
  while (WEEKEND_DAYS.includes(n.getDay())) n = advance(n, { days: 1 });
  return n;
};
/**
 * @param {Date} d
 * @returns {Date}
 */
export const prevWeekday = (d) => {
  let n = advance(d, { days: -1 });
  while (WEEKEND_DAYS.includes(n.getDay())) n = advance(n, { days: -1 });
  return n;
};

// ---- predicates -------------------------------------------------------------

const sameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/**
 * @param {Date} d
 * @returns {boolean}
 */
export const isToday = (d) => sameDay(d, current());
/**
 * @param {Date} d
 * @returns {boolean}
 */
export const isTomorrow = (d) => sameDay(d, tomorrow());
/**
 * @param {Date} d
 * @returns {boolean}
 */
export const isYesterday = (d) => sameDay(d, yesterday());
/**
 * @param {Date} d
 * @returns {boolean}
 */
export const isPast = (d) => d.getTime() < Date.now();
/**
 * @param {Date} d
 * @returns {boolean}
 */
export const isFuture = (d) => d.getTime() > Date.now();
/**
 * @param {Date} d
 * @returns {boolean}
 */
export const isWeekend = (d) => WEEKEND_DAYS.includes(d.getDay());
/**
 * @param {Date} d
 * @returns {boolean}
 */
export const isWeekday = (d) => !isWeekend(d);
/**
 * @param {Date} d
 * @param {Date} other
 * @returns {boolean}
 */
export const isBeforeDate = (d, other) => d.getTime() < other.getTime();
/**
 * @param {Date} d
 * @param {Date} other
 * @returns {boolean}
 */
export const isAfterDate = (d, other) => d.getTime() > other.getTime();

// ---- ranges -----------------------------------------------------------------
// Rails returns Ranges; these return [start, end] tuples.

/**
 * @param {Date} d
 * @returns {[Date, Date]}
 */
export const allDay = (d) => [beginningOfDay(d), endOfDay(d)];
/**
 * @param {Date} d
 * @param {DayName} [startDay]
 * @returns {[Date, Date]}
 */
export const allWeek = (d, startDay = beginningOfWeekDefault) => [beginningOfWeek(d, startDay), endOfWeek(d, startDay)];
/**
 * @param {Date} d
 * @returns {[Date, Date]}
 */
export const allMonth = (d) => [beginningOfMonth(d), endOfMonth(d)];
/**
 * @param {Date} d
 * @returns {[Date, Date]}
 */
export const allQuarter = (d) => [beginningOfQuarter(d), endOfQuarter(d)];
/**
 * @param {Date} d
 * @returns {[Date, Date]}
 */
export const allYear = (d) => [beginningOfYear(d), endOfYear(d)];

/**
 * @param {Date} d
 * @returns {number}
 */
export const secondsSinceMidnight = (d) => (d.getTime() - beginningOfDay(d).getTime()) / 1000;
/**
 * @param {Date} d
 * @returns {number}
 */
export const secondsUntilEndOfDay = (d) => Math.floor((endOfDay(d).getTime() - d.getTime()) / 1000);

// ---- strftime / formatting -------------------------------------------------

const pad = (value, width, flag, defaultPad = "0") => {
  const s = String(Math.abs(value));
  const sign = value < 0 ? "-" : "";
  if (flag === "-") return sign + s;
  const ch = flag === "_" ? " " : flag === "0" ? "0" : defaultPad;
  return sign + s.padStart(width, ch);
};

function utcOffset(d, colon) {
  const offset = -d.getTimezoneOffset();
  const sign = offset < 0 ? "-" : "+";
  const abs = Math.abs(offset);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return colon ? `${sign}${hh}:${mm}` : `${sign}${hh}${mm}`;
}

function zoneName(d) {
  if (typeof d.zone === "function") return d.zone(); // TimeWithZone
  try {
    return new Intl.DateTimeFormat("en-US", { timeZoneName: "short" })
      .formatToParts(d)
      .find((p) => p.type === "timeZoneName")?.value ?? "";
  } catch {
    return "";
  }
}

// Works for Date and anything with Date-style getters (TimeWithZone).
function dayOfYear(d) {
  const utcDay = (y, m, day) => {
    const x = new Date(0);
    x.setUTCFullYear(y, m, day);
    return x.getTime();
  };
  return Math.round((utcDay(d.getFullYear(), d.getMonth(), d.getDate()) - utcDay(d.getFullYear(), 0, 1)) / 86400000) + 1;
}

function weekNumber(d, firstWeekday) {
  const yday = dayOfYear(d) - 1;
  const wday = (d.getDay() + 7 - firstWeekday) % 7;
  return Math.floor((yday + 7 - wday) / 7);
}

/**
 * strftime(d, "%Y-%m-%d %H:%M:%S") with Ruby's directives and flags (-, _, 0, ^, #).
 * @param {DateLike} d
 * @param {string} format
 * @returns {string}
 */
export function strftime(d, format) {
  return format.replace(/%([-_0^#]*)(\d*)(:{0,2})([a-zA-Z%+])/g, (match, flags, widthStr, colons, conv) => {
    const flag = flags.includes("-") ? "-" : flags.includes("_") ? "_" : flags.includes("0") ? "0" : undefined;
    const upper = flags.includes("^") || flags.includes("#");
    const width = widthStr ? Number(widthStr) : undefined;
    const num = (v, w, def) => pad(v, width ?? w, flag, def);
    const str = (s) => {
      const out = upper ? s.toUpperCase() : s;
      return width ? out.padStart(width, flag === "0" ? "0" : " ") : out;
    };
    const hours12 = d.getHours() % 12 || 12;
    switch (conv) {
      case "Y": return width ? num(d.getFullYear(), width) : String(d.getFullYear());
      case "C": return num(Math.floor(d.getFullYear() / 100), 2);
      case "y": return num(d.getFullYear() % 100, 2);
      case "m": return num(d.getMonth() + 1, 2);
      case "B": return str(MONTH_NAMES[d.getMonth()]);
      case "b": case "h": return str(MONTH_NAMES[d.getMonth()].slice(0, 3));
      case "d": return num(d.getDate(), 2);
      case "e": return num(d.getDate(), 2, " ");
      case "j": return num(dayOfYear(d), 3);
      case "H": return num(d.getHours(), 2);
      case "k": return num(d.getHours(), 2, " ");
      case "I": return num(hours12, 2);
      case "l": return num(hours12, 2, " ");
      case "M": return num(d.getMinutes(), 2);
      case "S": return num(d.getSeconds(), 2);
      case "L": return String(d.getMilliseconds()).padStart(3, "0").padEnd(width ?? 3, "0").slice(0, width ?? 3);
      case "N": return String(d.getMilliseconds()).padStart(3, "0").padEnd(width ?? 9, "0").slice(0, width ?? 9);
      case "p": return flags.includes("#") ? (d.getHours() < 12 ? "am" : "pm") : d.getHours() < 12 ? "AM" : "PM";
      case "P": return d.getHours() < 12 ? "am" : "pm";
      case "A": return str(DAY_NAMES[d.getDay()]);
      case "a": return str(DAY_NAMES[d.getDay()].slice(0, 3));
      case "u": return String(d.getDay() || 7);
      case "w": return String(d.getDay());
      case "U": return num(weekNumber(d, 0), 2);
      case "W": return num(weekNumber(d, 1), 2);
      case "Z": return str(zoneName(d));
      case "z": return utcOffset(d, colons.length > 0);
      case "s": return String(Math.floor(d.getTime() / 1000));
      case "F": return strftime(d, "%Y-%m-%d");
      case "T": case "X": return strftime(d, "%H:%M:%S");
      case "D": case "x": return strftime(d, "%m/%d/%y");
      case "R": return strftime(d, "%H:%M");
      case "r": return strftime(d, "%I:%M:%S %p");
      case "c": return strftime(d, "%a %b %e %H:%M:%S %Y");
      case "+": return strftime(d, "%a %b %e %H:%M:%S %Z %Y");
      case "n": return "\n";
      case "t": return "\t";
      case "%": return "%";
      default: return match;
    }
  });
}

// Equivalent of Time::DATE_FORMATS. Add your own: TIME_FORMATS.custom = "%H:%M".
/** @type {Record<string, Formatter>} */
export const TIME_FORMATS = {
  db: "%Y-%m-%d %H:%M:%S",
  inspect: "%Y-%m-%d %H:%M:%S.%9N %z",
  number: "%Y%m%d%H%M%S",
  nsec: "%Y%m%d%H%M%S%9N",
  usec: "%Y%m%d%H%M%S%6N",
  time: "%H:%M",
  short: "%d %b %H:%M",
  long: "%B %d, %Y %H:%M",
  long_ordinal: (d) => strftime(d, `%B ${ordinalize(d.getDate())}, %Y %H:%M`),
  rfc822: "%a, %d %b %Y %H:%M:%S %z",
  iso8601: (d) => iso8601(d),
};

// Equivalent of Date::DATE_FORMATS.
/** @type {Record<string, Formatter>} */
export const DATE_FORMATS = {
  short: "%-d %b",
  long: "%B %-d, %Y",
  db: "%Y-%m-%d",
  inspect: "%Y-%m-%d",
  number: "%Y%m%d",
  long_ordinal: (d) => strftime(d, `%B ${ordinalize(d.getDate())}, %Y`),
  rfc822: "%-d %b %Y",
  iso8601: "%Y-%m-%d",
};

/**
 * toFormattedS(t, "db") // => "2007-01-18 06:10:17"
 * toFormattedS(d, "long", DATE_FORMATS) // => "January 18, 2007"
 * @param {DateLike} d
 * @param {string} [format]
 * @param {Record<string, Formatter>} [formats]
 * @returns {string}
 */
export function toFormattedS(d, format = "default", formats = TIME_FORMATS) {
  const formatter = formats[format];
  if (formatter === undefined) return d.toString();
  return typeof formatter === "function" ? formatter(d) : strftime(d, formatter);
}
export const toFs = toFormattedS;

/**
 * iso8601(t) // => "2007-01-18T06:10:17-05:00" (local offset; "Z" when UTC)
 * @param {DateLike} d
 * @param {number} [fractionDigits]
 * @returns {string}
 */
export function iso8601(d, fractionDigits = 0) {
  const offset = d.getTimezoneOffset() === 0 ? "Z" : utcOffset(d, true);
  const fraction = fractionDigits > 0 ? `.${strftime(d, `%${fractionDigits}N`)}` : "";
  return strftime(d, "%Y-%m-%dT%H:%M:%S") + fraction + offset;
}
export const xmlschema = iso8601;

/**
 * Ruby's <=> for dates; useful in sort().
 * @param {DateLike} a
 * @param {DateLike} b
 * @returns {number}
 */
export const compare = (a, b) => Math.sign(a.getTime() - b.getTime());
