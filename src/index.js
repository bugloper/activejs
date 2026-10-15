// activejs — a port of Rails' ActiveSupport to JavaScript.
//
// Everything here is side-effect free. For Rails-style prototype extensions
// ("person".pluralize(), (2).days().ago()) import "@bugloper/activejs/core_ext".

// Inflector
export * as Inflector from "./inflector/index.js";
export {
  Inflections, inflections, pluralize, singularize, camelize, underscore, humanize, titleize, tableize,
  classify, dasherize, demodulize, deconstantize, foreignKey, ordinal, ordinalize, upcaseFirst,
  downcaseFirst, constantize, safeConstantize, transliterate, parameterize,
} from "./inflector/index.js";

// Core extensions as plain functions
export * as ObjectExt from "./core_ext/object.js";
export * as StringExt from "./core_ext/string.js";
export * as ArrayExt from "./core_ext/array.js";
export * as HashExt from "./core_ext/hash.js";
export * as DateExt from "./core_ext/date.js";
export * as NumericExt from "./core_ext/numeric.js";
export {
  isBlank, isPresent, presence, tryCall, tryBang, isIn, presenceIn, deepDup, toParam, toQuery, withOptions,
} from "./core_ext/object.js";
export {
  squish, truncate, truncateWords, truncateBytes, stripHeredoc, indent, inquiry,
} from "./core_ext/string.js";
export {
  wrap, toSentence, inGroupsOf, inGroups, splitBy, extractOptions, excluding, including, indexBy, indexWith,
  many, pluck, pick, sum, minimum, maximum, inOrderOf, sole, SoleItemExpectedError,
} from "./core_ext/array.js";
export {
  deepMerge, reverseMerge, except, slice, extract, deepTransformKeys, deepTransformValues, assertValidKeys,
} from "./core_ext/hash.js";
export { strftime, setBeginningOfWeek, TIME_FORMATS, DATE_FORMATS } from "./core_ext/date.js";

// Time
export * from "./duration.js";
export { TimeZone, TimeWithZone, Time, inTimeZone } from "./time_zone.js";

// Numbers
export * as NumberHelper from "./number_helper.js";
export {
  numberToCurrency, numberToDelimited, numberToHuman, numberToHumanSize, numberToPercentage, numberToPhone,
  numberToRounded,
} from "./number_helper.js";

// Classes and modules
export { Callbacks, defineCallbacks, setCallback, skipCallback, resetCallbacks, runCallbacks, runCallbacksAsync, abort } from "./callbacks.js";
export { concern, include, prepend, includes, mixin } from "./concern.js";
export { Notifications, Event as NotificationEvent, Fanout } from "./notifications.js";
export * as Cache from "./cache.js";
export { CurrentAttributes } from "./current_attributes.js";
export { Configurable, configAccessor } from "./configurable.js";
export { OrderedOptions, InheritableOptions, KeyError } from "./ordered_options.js";
export { StringInquirer } from "./string_inquirer.js";
export { ArrayInquirer } from "./array_inquirer.js";
export { Deprecation, DeprecationException } from "./deprecation.js";
export { Rescuable, rescueFrom, rescueWithHandler } from "./rescuable.js";
export { ErrorReporter } from "./error_reporter.js";
export { ParameterFilter } from "./parameter_filter.js";
export { BacktraceCleaner } from "./backtrace_cleaner.js";
export {
  SafeBuffer, htmlSafe, isHtmlSafe, htmlEscape, htmlEscapeOnce, jsonEscape, urlEncode, xmlNameEscape, safeJoin,
} from "./safe_buffer.js";
export { Logger, TaggedLogging, BroadcastLogger } from "./logger.js";
export { onLoad, runLoadHooks } from "./lazy_load_hooks.js";
export { classAttribute, mattrAccessor, cattrAccessor, delegate, delegateMissingTo, aliasAttribute, DelegationError } from "./class_attribute.js";
export { ActiveSupportJSON as JSON, asJson } from "./json.js";
export { realtime, realtimeAsync, benchmark } from "./benchmark.js";
export { Gzip } from "./gzip.js";
export {
  KeyGenerator, CachingKeyGenerator, MessageVerifier, MessageEncryptor, InvalidSignature, InvalidMessage,
  SecureRandom, Digest, secureCompare, fixedLengthSecureCompare,
} from "./security.js";
