// Global type augmentations for `import "activejs/core_ext"`.
//
// The build appends this file to the generated types/core_ext/register.d.ts,
// so import paths are relative to types/core_ext/. Signatures for String,
// Number and Date are derived from the functional API (Bound<typeof fn>) so
// they can't drift; Array/Set/Map methods are written out to keep the
// element type T. test/core_ext_types.test.js checks this file declares
// exactly the methods install() adds.

type Bound<F> = F extends (self: any, ...args: infer A) => infer R ? (...args: A) => R : never;

type Inflector = typeof import("../inflector/index.js");
type StringExt = typeof import("../core_ext/string.js");
type DateExt = typeof import("../core_ext/date.js");
type NumericExt = typeof import("../core_ext/numeric.js");
type NumberHelper = typeof import("../number_helper.js");
type Duration = import("../duration.js").Duration;
type TimeWithZone = import("../time_zone.js").TimeWithZone;
type TimeZone = import("../time_zone.js").TimeZone;
type SafeBuffer = import("../safe_buffer.js").SafeBuffer;
type ArrayInquirer = import("../array_inquirer.js").ArrayInquirer;

interface ActiveJsCoreExt<Self> {
  isBlank(): boolean;
  isPresent(): boolean;
  presence(): Self | undefined;
  isIn(collection: { includes(value: unknown): boolean } | { has(value: unknown): boolean } | object): boolean;
  presenceIn(collection: { includes(value: unknown): boolean } | { has(value: unknown): boolean } | object): Self | undefined;
  tryCall(method: string | ((self: Self, ...args: any[]) => unknown), ...args: unknown[]): any;
  deepDup(): Self;
  toParam(): unknown;
  toQuery(key: string): string;
  asJson(options?: { only?: string | string[]; except?: string | string[] }): unknown;
  isHtmlSafe(): boolean;
}

declare global {
  interface String extends ActiveJsCoreExt<string> {
    pluralize: Bound<Inflector["pluralize"]>;
    singularize: Bound<Inflector["singularize"]>;
    camelize(firstLetter?: "upper" | "lower" | boolean): string;
    underscore: Bound<Inflector["underscore"]>;
    titleize: Bound<Inflector["titleize"]>;
    titlecase: Bound<Inflector["titleize"]>;
    tableize: Bound<Inflector["tableize"]>;
    classify: Bound<Inflector["classify"]>;
    dasherize: Bound<Inflector["dasherize"]>;
    demodulize: Bound<Inflector["demodulize"]>;
    deconstantize: Bound<Inflector["deconstantize"]>;
    upcaseFirst: Bound<Inflector["upcaseFirst"]>;
    downcaseFirst: Bound<Inflector["downcaseFirst"]>;
    constantize: Bound<Inflector["constantize"]>;
    safeConstantize: Bound<Inflector["safeConstantize"]>;
    humanize: Bound<Inflector["humanize"]>;
    foreignKey: Bound<Inflector["foreignKey"]>;
    parameterize: Bound<Inflector["parameterize"]>;
    transliterate: Bound<Inflector["transliterate"]>;
    from: Bound<StringExt["from"]>;
    to: Bound<StringExt["to"]>;
    first: Bound<StringExt["first"]>;
    last: Bound<StringExt["last"]>;
    squish: Bound<StringExt["squish"]>;
    remove: Bound<StringExt["remove"]>;
    truncate: Bound<StringExt["truncate"]>;
    truncateWords: Bound<StringExt["truncateWords"]>;
    truncateBytes: Bound<StringExt["truncateBytes"]>;
    stripHeredoc: Bound<StringExt["stripHeredoc"]>;
    indent: Bound<StringExt["indent"]>;
    inquiry: Bound<StringExt["inquiry"]>;
    exclude: Bound<StringExt["exclude"]>;
    toDate: Bound<StringExt["toDate"]>;
    toTime: Bound<StringExt["toTime"]>;
    htmlSafe(): SafeBuffer;
  }

  interface Number extends ActiveJsCoreExt<number> {
    seconds(): Duration;
    second(): Duration;
    minutes(): Duration;
    minute(): Duration;
    hours(): Duration;
    hour(): Duration;
    days(): Duration;
    day(): Duration;
    weeks(): Duration;
    week(): Duration;
    fortnights(): Duration;
    fortnight(): Duration;
    months(): Duration;
    month(): Duration;
    years(): Duration;
    year(): Duration;
    milliseconds(): Duration;
    bytes(): number;
    byte(): number;
    kilobytes(): number;
    kilobyte(): number;
    megabytes(): number;
    megabyte(): number;
    gigabytes(): number;
    gigabyte(): number;
    terabytes(): number;
    terabyte(): number;
    petabytes(): number;
    petabyte(): number;
    exabytes(): number;
    exabyte(): number;
    zettabytes(): number;
    zettabyte(): number;
    isMultipleOf: Bound<NumericExt["isMultipleOf"]>;
    isBetween: Bound<NumericExt["isBetween"]>;
    ordinal: Bound<Inflector["ordinal"]>;
    ordinalize: Bound<Inflector["ordinalize"]>;
    toFormattedS: Bound<NumericExt["toFormattedS"]>;
    toFs: Bound<NumericExt["toFormattedS"]>;
    numberToCurrency: Bound<NumberHelper["numberToCurrency"]>;
    numberToHuman: Bound<NumberHelper["numberToHuman"]>;
    numberToHumanSize: Bound<NumberHelper["numberToHumanSize"]>;
    numberToPercentage: Bound<NumberHelper["numberToPercentage"]>;
    numberToDelimited: Bound<NumberHelper["numberToDelimited"]>;
    numberToRounded: Bound<NumberHelper["numberToRounded"]>;
    numberToPhone: Bound<NumberHelper["numberToPhone"]>;
  }

  interface Boolean extends ActiveJsCoreExt<boolean> {}

  interface Array<T> extends ActiveJsCoreExt<T[]> {
    toSentence(options?: { wordsConnector?: string; twoWordsConnector?: string; lastWordConnector?: string }): string;
    inGroupsOf<F = null>(number: number, fillWith?: F | false): Array<Array<T | F>>;
    inGroups<F = null>(number: number, fillWith?: F | false): Array<Array<T | F>>;
    splitBy(valueOrFn: T | ((item: T) => boolean)): T[][];
    second(): T | undefined;
    third(): T | undefined;
    fourth(): T | undefined;
    fifth(): T | undefined;
    fortyTwo(): T | undefined;
    secondToLast(): T | undefined;
    thirdToLast(): T | undefined;
    from(position: number): T[];
    to(position: number): T[];
    excluding(...elements: Array<T | T[]>): T[];
    without(...elements: Array<T | T[]>): T[];
    including<U>(...elements: Array<U | U[]>): Array<T | U>;
    indexBy(key: keyof T | ((item: T) => PropertyKey)): Record<string, T>;
    indexWith<V>(valueOrFn: V | ((item: T) => V)): Record<string, V>;
    many(predicate?: (item: T) => boolean): boolean;
    pluck<K extends keyof T>(key: K): Array<T[K]>;
    pluck<K extends keyof T>(...keys: K[]): Array<Array<T[K]>>;
    pick<K extends keyof T>(key: K): T[K] | undefined;
    pick<K extends keyof T>(...keys: K[]): Array<T[K]> | undefined;
    sum(): T extends number ? number : unknown;
    sum<V>(fn: (item: T) => V, identity?: V): V;
    minimum<K extends keyof T>(key: K | ((item: T) => T[K])): T[K] | undefined;
    maximum<K extends keyof T>(key: K | ((item: T) => T[K])): T[K] | undefined;
    compactBlank(): T[];
    inOrderOf<K extends keyof T>(key: K | ((item: T) => unknown), series: unknown[], options?: { filter?: boolean }): T[];
    sole(): T;
    extractOptions(): Record<string, unknown>;
    inquiry(): ArrayInquirer;
  }

  interface Set<T> extends ActiveJsCoreExt<Set<T>> {
    indexBy(key: keyof T | ((item: T) => PropertyKey)): Record<string, T>;
    indexWith<V>(valueOrFn: V | ((item: T) => V)): Record<string, V>;
    many(predicate?: (item: T) => boolean): boolean;
    pluck<K extends keyof T>(key: K): Array<T[K]>;
    pick<K extends keyof T>(key: K): T[K] | undefined;
    sum(): T extends number ? number : unknown;
    sum<V>(fn: (item: T) => V, identity?: V): V;
    minimum<K extends keyof T>(key: K | ((item: T) => T[K])): T[K] | undefined;
    maximum<K extends keyof T>(key: K | ((item: T) => T[K])): T[K] | undefined;
    excluding(...elements: Array<T | T[]>): T[];
    including<U>(...elements: Array<U | U[]>): Array<T | U>;
    compactBlank(): T[];
    sole(): T;
  }

  interface Map<K, V> extends ActiveJsCoreExt<Map<K, V>> {
    indexBy(key: number | ((entry: [K, V]) => PropertyKey)): Record<string, [K, V]>;
    indexWith<W>(valueOrFn: W | ((entry: [K, V]) => W)): Record<string, W>;
    many(predicate?: (entry: [K, V]) => boolean): boolean;
    pluck(index: 0 | 1): Array<K | V>;
    pick(index: 0 | 1): K | V | undefined;
    sum<W>(fn: (entry: [K, V]) => W, identity?: W): W;
    minimum(key: number | ((entry: [K, V]) => unknown)): unknown;
    maximum(key: number | ((entry: [K, V]) => unknown)): unknown;
    excluding(...elements: Array<[K, V]>): Array<[K, V]>;
    including<U>(...elements: Array<U | U[]>): Array<[K, V] | U>;
    compactBlank(): Array<[K, V]>;
    sole(): [K, V];
  }

  interface Date extends ActiveJsCoreExt<Date> {
    advance: Bound<DateExt["advance"]>;
    change: Bound<DateExt["change"]>;
    since: Bound<DateExt["since"]>;
    ago: Bound<DateExt["ago"]>;
    inTime: Bound<DateExt["inTime"]>;
    beginningOfDay: Bound<DateExt["beginningOfDay"]>;
    middleOfDay: Bound<DateExt["middleOfDay"]>;
    endOfDay: Bound<DateExt["endOfDay"]>;
    beginningOfHour: Bound<DateExt["beginningOfHour"]>;
    endOfHour: Bound<DateExt["endOfHour"]>;
    beginningOfMinute: Bound<DateExt["beginningOfMinute"]>;
    endOfMinute: Bound<DateExt["endOfMinute"]>;
    midnight: Bound<DateExt["midnight"]>;
    noon: Bound<DateExt["noon"]>;
    atBeginningOfDay: Bound<DateExt["atBeginningOfDay"]>;
    beginningOfWeek: Bound<DateExt["beginningOfWeek"]>;
    endOfWeek: Bound<DateExt["endOfWeek"]>;
    monday: Bound<DateExt["monday"]>;
    sunday: Bound<DateExt["sunday"]>;
    beginningOfMonth: Bound<DateExt["beginningOfMonth"]>;
    endOfMonth: Bound<DateExt["endOfMonth"]>;
    beginningOfQuarter: Bound<DateExt["beginningOfQuarter"]>;
    endOfQuarter: Bound<DateExt["endOfQuarter"]>;
    quarter: Bound<DateExt["quarter"]>;
    beginningOfYear: Bound<DateExt["beginningOfYear"]>;
    endOfYear: Bound<DateExt["endOfYear"]>;
    yesterday: Bound<DateExt["yesterday"]>;
    tomorrow: Bound<DateExt["tomorrow"]>;
    prevDay: Bound<DateExt["prevDay"]>;
    nextDay: Bound<DateExt["nextDay"]>;
    daysAgo: Bound<DateExt["daysAgo"]>;
    daysSince: Bound<DateExt["daysSince"]>;
    weeksAgo: Bound<DateExt["weeksAgo"]>;
    weeksSince: Bound<DateExt["weeksSince"]>;
    monthsAgo: Bound<DateExt["monthsAgo"]>;
    monthsSince: Bound<DateExt["monthsSince"]>;
    yearsAgo: Bound<DateExt["yearsAgo"]>;
    yearsSince: Bound<DateExt["yearsSince"]>;
    prevMonth: Bound<DateExt["prevMonth"]>;
    nextMonth: Bound<DateExt["nextMonth"]>;
    lastMonth: Bound<DateExt["lastMonth"]>;
    prevQuarter: Bound<DateExt["prevQuarter"]>;
    nextQuarter: Bound<DateExt["nextQuarter"]>;
    prevYear: Bound<DateExt["prevYear"]>;
    nextYear: Bound<DateExt["nextYear"]>;
    lastYear: Bound<DateExt["lastYear"]>;
    nextWeek: Bound<DateExt["nextWeek"]>;
    prevWeek: Bound<DateExt["prevWeek"]>;
    lastWeek: Bound<DateExt["lastWeek"]>;
    nextOccurring: Bound<DateExt["nextOccurring"]>;
    prevOccurring: Bound<DateExt["prevOccurring"]>;
    nextWeekday: Bound<DateExt["nextWeekday"]>;
    prevWeekday: Bound<DateExt["prevWeekday"]>;
    isToday: Bound<DateExt["isToday"]>;
    isTomorrow: Bound<DateExt["isTomorrow"]>;
    isYesterday: Bound<DateExt["isYesterday"]>;
    isPast: Bound<DateExt["isPast"]>;
    isFuture: Bound<DateExt["isFuture"]>;
    isWeekend: Bound<DateExt["isWeekend"]>;
    isWeekday: Bound<DateExt["isWeekday"]>;
    allDay: Bound<DateExt["allDay"]>;
    allWeek: Bound<DateExt["allWeek"]>;
    allMonth: Bound<DateExt["allMonth"]>;
    allQuarter: Bound<DateExt["allQuarter"]>;
    allYear: Bound<DateExt["allYear"]>;
    secondsSinceMidnight: Bound<DateExt["secondsSinceMidnight"]>;
    secondsUntilEndOfDay: Bound<DateExt["secondsUntilEndOfDay"]>;
    daysToWeekStart: Bound<DateExt["daysToWeekStart"]>;
    strftime: Bound<DateExt["strftime"]>;
    toFormattedS: Bound<DateExt["toFormattedS"]>;
    toFs: Bound<DateExt["toFs"]>;
    iso8601: Bound<DateExt["iso8601"]>;
    xmlschema: Bound<DateExt["xmlschema"]>;
    inTimeZone(zone?: string | TimeZone): TimeWithZone;
    plus(other: Duration | number): Date;
    minus(other: Date): number;
    minus(other: Duration | number): Date;
  }
}
