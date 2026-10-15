// Opt-in prototype extensions, the JS analogue of
// `require "active_support/core_ext"`.
//
//   import "@bugloper/activejs/core_ext";
//   "person".pluralize()              // => "people"
//   (2).days().fromNow()              // => Date two days from now
//   [1, 2, 3].toSentence()            // => "1, 2, and 3"
//   new Date().beginningOfMonth()
//   "  ".isBlank()                    // => true
//
// Methods are non-enumerable and are never installed over a property that
// already exists (so native methods such as String#at and Array#at are kept).
// Object.prototype is deliberately left alone: use the isBlank/isPresent/
// presence/tryCall functions for plain objects, null and undefined.
// Call uninstall() to remove everything this module added.
import * as Inflector from "../inflector/index.js";
import * as Obj from "./object.js";
import * as Str from "./string.js";
import * as Arr from "./array.js";
import * as DateExt from "./date.js";
import * as Num from "./numeric.js";
import * as NumberHelper from "../number_helper.js";
import { Duration } from "../duration.js";
import { htmlSafe, isHtmlSafe } from "../safe_buffer.js";
import { inTimeZone } from "../time_zone.js";
import { asJson } from "../json.js";
import { ArrayInquirer } from "../array_inquirer.js";

const installed = [];

function define(proto, name, fn) {
  if (name in proto) return;
  Object.defineProperty(fn, Obj.CORE_EXT, { value: true });
  Object.defineProperty(proto, name, { value: fn, writable: true, configurable: true, enumerable: false });
  installed.push([proto, name]);
}

// Wraps a function taking the receiver as its first argument.
const self = (fn) => function (...args) { return fn(this.valueOf(), ...args); };
const selfObj = (fn) => function (...args) { return fn(this, ...args); };

export function install() {
  if (installed.length) return;

  // ---- shared: blank?/present?/presence/deep_dup/to_param/to_query/in? ----
  for (const proto of [String.prototype, Number.prototype, Boolean.prototype, Array.prototype, Date.prototype, Map.prototype, Set.prototype]) {
    define(proto, "isBlank", function () { return Obj.isBlank(this.valueOf()); });
    define(proto, "isPresent", function () { return Obj.isPresent(this.valueOf()); });
    define(proto, "presence", function () { return Obj.presence(this.valueOf()); });
    define(proto, "isIn", function (collection) { return Obj.isIn(this.valueOf(), collection); });
    define(proto, "presenceIn", function (collection) { return Obj.presenceIn(this.valueOf(), collection); });
    define(proto, "tryCall", function (method, ...args) { return Obj.tryCall(this, method, ...args); });
    define(proto, "deepDup", function () { return Obj.deepDup(this.valueOf()); });
    define(proto, "toParam", function () { return Obj.toParam(this.valueOf()); });
    define(proto, "toQuery", function (key) { return Obj.toQuery(this.valueOf(), key); });
    define(proto, "asJson", function (options) { return asJson(this.valueOf(), options); });
    define(proto, "isHtmlSafe", function () { return isHtmlSafe(this.valueOf()); });
  }

  // ---- String ----
  const S = String.prototype;
  for (const name of ["pluralize", "singularize"]) define(S, name, self(Inflector[name]));
  define(S, "camelize", self(
    /** @param {string} s @param {"upper" | "lower" | boolean} [first] */
    (s, first = "upper") => Inflector.camelize(s, first !== "lower" && first !== false),
  ));
  for (const name of ["underscore", "titleize", "tableize", "classify", "dasherize", "demodulize",
    "deconstantize", "upcaseFirst", "downcaseFirst", "constantize", "safeConstantize"]) {
    define(S, name, self(Inflector[name]));
  }
  define(S, "titlecase", self(Inflector.titleize));
  define(S, "humanize", self(Inflector.humanize));
  define(S, "foreignKey", self(Inflector.foreignKey));
  define(S, "parameterize", self(Inflector.parameterize));
  define(S, "transliterate", self(Inflector.transliterate));
  for (const name of ["from", "to", "first", "last", "squish", "remove", "truncate", "truncateWords",
    "truncateBytes", "stripHeredoc", "indent", "inquiry", "exclude", "toDate", "toTime"]) {
    define(S, name, self(Str[name]));
  }
  define(S, "htmlSafe", function () { return htmlSafe(this.valueOf()); });

  // ---- Number ----
  const N = Number.prototype;
  for (const name of ["seconds", "minutes", "hours", "days", "weeks", "fortnights", "months", "years"]) {
    define(N, name, self((n) => Duration[name === "fortnights" ? "weeks" : name](name === "fortnights" ? n * 2 : n)));
    define(N, name.slice(0, -1), N[name]);
  }
  define(N, "milliseconds", self((n) => Duration.seconds(n / 1000)));
  for (const name of ["bytes", "kilobytes", "megabytes", "gigabytes", "terabytes", "petabytes", "exabytes", "zettabytes"]) {
    define(N, name, self(Num[name]));
    define(N, name.slice(0, -1), self(Num[name]));
  }
  define(N, "isMultipleOf", self(Num.isMultipleOf));
  define(N, "isBetween", self(Num.isBetween));
  define(N, "ordinal", self(Inflector.ordinal));
  define(N, "ordinalize", self(Inflector.ordinalize));
  define(N, "toFormattedS", self(Num.toFormattedS));
  define(N, "toFs", self(Num.toFormattedS));
  for (const name of ["numberToCurrency", "numberToHuman", "numberToHumanSize", "numberToPercentage",
    "numberToDelimited", "numberToRounded", "numberToPhone"]) {
    define(N, name, self(NumberHelper[name]));
  }

  // ---- Array / Enumerable ----
  const A = Array.prototype;
  for (const name of ["toSentence", "inGroupsOf", "inGroups", "splitBy", "second", "third", "fourth", "fifth",
    "fortyTwo", "secondToLast", "thirdToLast", "from", "to", "excluding", "without", "including", "indexBy",
    "indexWith", "many", "pluck", "pick", "sum", "minimum", "maximum", "compactBlank", "inOrderOf", "sole",
    "extractOptions"]) {
    define(A, name, selfObj(Arr[name]));
  }
  define(A, "inquiry", function () { return new ArrayInquirer(this); });
  for (const proto of [Set.prototype, Map.prototype]) {
    for (const name of ["indexBy", "indexWith", "many", "pluck", "pick", "sum", "minimum", "maximum",
      "excluding", "including", "compactBlank", "sole"]) {
      define(proto, name, selfObj((x, ...args) => Arr[name]([...x], ...args)));
    }
  }

  // ---- Date ----
  const D = Date.prototype;
  for (const name of ["advance", "change", "since", "ago", "inTime", "beginningOfDay", "middleOfDay", "endOfDay",
    "beginningOfHour", "endOfHour", "beginningOfMinute", "endOfMinute", "midnight", "noon", "atBeginningOfDay",
    "beginningOfWeek", "endOfWeek", "monday", "sunday", "beginningOfMonth", "endOfMonth", "beginningOfQuarter",
    "endOfQuarter", "quarter", "beginningOfYear", "endOfYear", "yesterday", "tomorrow", "prevDay", "nextDay",
    "daysAgo", "daysSince", "weeksAgo", "weeksSince", "monthsAgo", "monthsSince", "yearsAgo", "yearsSince",
    "prevMonth", "nextMonth", "lastMonth", "prevQuarter", "nextQuarter", "prevYear", "nextYear", "lastYear",
    "nextWeek", "prevWeek", "lastWeek", "nextOccurring", "prevOccurring", "nextWeekday", "prevWeekday",
    "isToday", "isTomorrow", "isYesterday", "isPast", "isFuture", "isWeekend", "isWeekday", "allDay", "allWeek",
    "allMonth", "allQuarter", "allYear", "secondsSinceMidnight", "secondsUntilEndOfDay", "daysToWeekStart",
    "strftime", "toFormattedS", "toFs", "iso8601", "xmlschema"]) {
    define(D, name, selfObj(DateExt[name]));
  }
  define(D, "inTimeZone", selfObj(inTimeZone));
  // date.plus(days(1)) / date.minus(hours(2)) / date.minus(otherDate) => seconds
  define(D, "plus", function (other) {
    return other instanceof Duration ? other.since(this) : DateExt.since(this, Number(other));
  });
  define(D, "minus", function (other) {
    if (other instanceof Date) return (this.getTime() - other.getTime()) / 1000;
    return other instanceof Duration ? other.ago(this) : DateExt.ago(this, Number(other));
  });
}

export function uninstall() {
  for (const [proto, name] of installed.splice(0)) delete proto[name];
}

install();
