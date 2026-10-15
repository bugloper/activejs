// Pin the local zone so Date calculations are deterministic (each test file
// runs in its own process under `node --test`).
process.env.TZ = "America/New_York";

import { test } from "node:test";
import assert from "node:assert/strict";
import * as I from "../src/inflector/index.js";
import * as O from "../src/core_ext/object.js";
import * as S from "../src/core_ext/string.js";
import * as A from "../src/core_ext/array.js";
import * as H from "../src/core_ext/hash.js";
import * as D from "../src/core_ext/date.js";
import * as Num from "../src/core_ext/numeric.js";
import { Duration, days, hours, minutes, months, years, weeks, seconds } from "../src/duration.js";

// Inflection rules are process-wide, and runners such as `bun test` share one
// process across files, so tests that add rules must put the old ones back.
function restoringInflections(locale, fn) {
  const i = I.inflections(locale);
  const saved = {
    plurals: [...i.plurals], singulars: [...i.singulars], humans: [...i.humans],
    acronyms: Object.values(i.acronyms), uncountables: i.uncountables.toArray(),
  };
  try {
    fn();
  } finally {
    Object.assign(i, { plurals: saved.plurals, singulars: saved.singulars, humans: saved.humans });
    i.clear("acronyms");
    for (const word of saved.acronyms) i.acronym(word);
    i.clear("uncountables");
    i.uncountable(...saved.uncountables);
  }
}

test("inflections can be customised per locale", () => restoringInflections("en", () => restoringInflections("es", () => {
  I.inflections("en", (inflect) => {
    inflect.acronym("API");
    inflect.acronym("RESTful");
    inflect.irregular("octopus", "octopodes");
    inflect.uncountable("sushi");
    inflect.plural(/^(ox)$/i, "\\1en");
    inflect.human(/_cnt$/i, "\\1_count");
    inflect.human("legacy_col_person_name", "Name");
  });
  assert.equal(I.camelize("api_client"), "APIClient");
  assert.equal(I.underscore("APIClient"), "api_client");
  assert.equal(I.camelize("restful_controller"), "RESTfulController");
  assert.equal(I.camelize("api_client", false), "apiClient");
  assert.equal(I.humanize("api_key"), "API key");
  assert.equal(I.titleize("restful_api"), "RESTful API");
  assert.equal(I.pluralize("octopus"), "octopodes");
  assert.equal(I.singularize("octopodes"), "octopus");
  assert.equal(I.pluralize("sushi"), "sushi");
  assert.equal(I.humanize("jargon_cnt"), "Jargon count");
  assert.equal(I.humanize("legacy_col_person_name"), "Name");

  I.inflections("es", (inflect) => {
    inflect.plural(/$/, "s");
    inflect.plural(/([^aeéiou])$/i, "\\1es");
  });
  assert.equal(I.pluralize("papel", "es"), "papeles");
  assert.equal(I.pluralize("papel"), "papels");

  I.inflections("es").clear();
  assert.equal(I.pluralize("papel", "es"), "papel");
})));

test("customised inflections are restored afterwards", () => {
  assert.equal(I.pluralize("octopus"), "octopi");
  assert.equal(I.camelize("api_client"), "ApiClient");
  assert.equal(I.pluralize("sushi"), "sushis");
});

test("inflector helpers", () => {
  assert.equal(I.demodulize("ActiveSupport::Inflector::Inflections"), "Inflections");
  assert.equal(I.deconstantize("Net::HTTP::Get"), "Net::HTTP");
  assert.equal(I.deconstantize("String"), "");
  assert.equal(I.upcaseFirst("what a Lovely Day"), "What a Lovely Day");
  assert.equal(I.downcaseFirst("If They"), "if They");
  assert.equal(I.ordinal(-11), "th");
  assert.equal(I.transliterate("Ærøskøbing"), "AEroskobing");
  assert.equal(I.transliterate("Jürgen Müller", "?", { locale: "de" }), "Juergen Mueller");
  assert.equal(I.transliterate("日本"), "??");
  const ns = { Admin: { User: class User {} } };
  assert.equal(I.constantize("Admin::User", ns), ns.Admin.User);
  assert.equal(I.constantize("Admin.User", ns), ns.Admin.User);
  assert.throws(() => I.constantize("Nope", ns), ReferenceError);
  assert.equal(I.safeConstantize("Nope", ns), undefined);
});

test("blank / present / presence", () => {
  for (const v of [null, undefined, false, "", "   ", "\n\t", " ", [], {}, new Map(), new Set()]) {
    assert.equal(O.isBlank(v), true, `${JSON.stringify(v)} should be blank`);
  }
  for (const v of [0, 1, true, "a", [null], { a: undefined }, new Date(), () => {}]) {
    assert.equal(O.isPresent(v), true, `${String(v)} should be present`);
  }
  assert.equal(O.presence(""), undefined);
  assert.equal(O.presence("x"), "x");
  assert.equal(O.isBlank({ isBlank: () => true }), true);
});

test("tryCall, isIn, deepDup, toQuery, withOptions", () => {
  const user = { name: "Ada", greet(g) { return `${g}, ${this.name}`; } };
  assert.equal(O.tryCall(user, "greet", "Hi"), "Hi, Ada");
  assert.equal(O.tryCall(user, "name"), "Ada");
  assert.equal(O.tryCall(null, "greet"), undefined);
  assert.equal(O.tryCall(user, "missing"), undefined);
  assert.throws(() => O.tryBang(user, "missing"), TypeError);

  assert.equal(O.isIn(1, [1, 2]), true);
  assert.equal(O.isIn("lo", "hello"), true);
  assert.equal(O.isIn("a", new Set(["a"])), true);
  assert.equal(O.presenceIn("x", ["y"]), undefined);

  const original = { a: [1, { b: new Date(0) }], m: new Map([["k", [1]]]) };
  const copy = O.deepDup(original);
  copy.a[1].b.setFullYear(2000);
  copy.m.get("k").push(2);
  assert.equal(original.a[1].b.getTime(), 0);
  assert.deepEqual(original.m.get("k"), [1]);

  assert.equal(O.toParam([1, "a b", null]), "1/a b/");
  assert.equal(O.toQuery("x", "y z"), "y+z=x");

  const calls = [];
  const model = { hasMany(name, opts) { calls.push([name, opts]); } };
  O.withOptions(model, { dependent: "destroy" }, (m) => {
    m.hasMany("customers");
    m.hasMany("orders", { through: "x" });
  });
  assert.deepEqual(calls, [
    ["customers", { dependent: "destroy" }],
    ["orders", { dependent: "destroy", through: "x" }],
  ]);
});

test("string access and filters", () => {
  assert.equal(S.at("hello", 0), "h");
  assert.equal(S.at("hello", [1, -2]), "ell");
  assert.equal(S.at("hello", /l+/), "ll");
  assert.equal(S.at("hello", "lo"), "lo");
  assert.equal(S.at("hello", "xx"), undefined);
  assert.equal(S.from("hello", 2), "llo");
  assert.equal(S.from("hello", -2), "lo");
  assert.equal(S.to("hello", 2), "hel");
  assert.equal(S.to("hello", -2), "hell");
  assert.equal(S.first("hello", 2), "he");
  assert.equal(S.last("hello", 3), "llo");
  assert.equal(S.last("hello", 0), "");
  assert.equal(S.remove("foo bar test", " test", /bar/), "foo ");
  assert.equal(S.truncate("And they found that many people were sleeping better.", 25, { omission: "... (continued)" }), "And they f... (continued)");
  assert.equal(S.truncate("Once upon a time in a world", 15, { separator: /\s/ }), "Once upon a...");
  assert.equal(S.truncateWords("And they found that many people", 4, { separator: "@" }), "And they found that many people");
  assert.equal(S.truncateWords("Once<br>upon<br>a<br>time", 2, { separator: "<br>", omission: "…" }), "Once<br>upon…");
  assert.equal(S.truncateBytes("👍👍👍👍", 15), "👍👍👍…");
  assert.equal(S.stripHeredoc("    foo\n      bar\n    baz\n"), "foo\n  bar\nbaz\n");
  assert.equal(S.indent("foo\n\nbar", 2), "  foo\n\n  bar");
  assert.equal(S.indent("foo\n\nbar", 1, "\t", true), "\tfoo\n\t\n\tbar");
  assert.equal(S.indent("  foo\n  bar", 2), "    foo\n    bar");
  assert.equal(S.exclude("hello", "lo"), false);
  const env = S.inquiry("production");
  assert.equal(env.production(), true);
  assert.equal(env.development(), false);
  assert.equal(env.toUpperCase(), "PRODUCTION");
  assert.equal(`${env}`, "production");
});

test("string date conversions", () => {
  assert.equal(S.toDate("2012-12-13").getTime(), new Date(2012, 11, 13).getTime());
  assert.equal(S.toTime("2012-12-13 06:12").getTime(), new Date(2012, 11, 13, 6, 12).getTime());
  assert.equal(S.toTime("2012-12-13 06:12", "utc").toISOString(), "2012-12-13T06:12:00.000Z");
  assert.equal(S.toTime("2012-12-13T06:12:00+05:30").toISOString(), "2012-12-13T00:42:00.000Z");
  assert.equal(S.toTime(""), undefined);
});

test("array extensions", () => {
  assert.deepEqual(A.wrap(null), []);
  assert.deepEqual(A.wrap([1]), [1]);
  assert.deepEqual(A.wrap("a"), ["a"]);
  assert.equal(A.toSentence(["a", "b"], { twoWordsConnector: " or " }), "a or b");
  assert.equal(A.toSentence(["a", "b", "c"], { lastWordConnector: " or " }), "a, b or c");
  assert.deepEqual(A.inGroupsOf([1, 2, 3, 4, 5, 6, 7], 3), [[1, 2, 3], [4, 5, 6], [7, null, null]]);
  assert.deepEqual(A.inGroupsOf([1, 2, 3], 2, false), [[1, 2], [3]]);
  assert.deepEqual(A.inGroupsOf([1, 2, 3], 2, "&nbsp;"), [[1, 2], [3, "&nbsp;"]]);
  assert.deepEqual(A.inGroups([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 3), [[1, 2, 3, 4], [5, 6, 7, null], [8, 9, 10, null]]);
  assert.deepEqual(A.inGroups([1, 2, 3, 4, 5, 6, 7], 3, false), [[1, 2, 3], [4, 5], [6, 7]]);
  assert.deepEqual(A.splitBy([1, 2, 3, 4, 5], 3), [[1, 2], [4, 5]]);
  assert.deepEqual(A.splitBy([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], (i) => i % 3 === 0), [[1, 2], [4, 5], [7, 8], [10]]);
  const args = [1, { a: 1 }];
  assert.deepEqual(A.extractOptions(args), { a: 1 });
  assert.deepEqual(args, [1]);
  assert.equal(A.second([1, 2, 3]), 2);
  assert.equal(A.fortyTwo(Array.from({ length: 50 }, (_, i) => i)), 41);
  assert.equal(A.secondToLast([1, 2, 3]), 2);
  assert.deepEqual(A.from([1, 2, 3, 4], 2), [3, 4]);
  assert.deepEqual(A.to([1, 2, 3, 4], -2), [1, 2, 3]);
});

test("enumerable extensions", () => {
  const people = [{ id: 1, name: "David", age: 30 }, { id: 2, name: "Rafael", age: 25 }, { id: 3, name: "Aaron", age: 40 }];
  assert.deepEqual(A.pluck(people, "name"), ["David", "Rafael", "Aaron"]);
  assert.deepEqual(A.pluck(people, "id", "name"), [[1, "David"], [2, "Rafael"], [3, "Aaron"]]);
  assert.equal(A.pick(people, "name"), "David");
  assert.deepEqual(A.pick(people, "id", "name"), [1, "David"]);
  assert.equal(A.pick([], "name"), undefined);
  assert.deepEqual(Object.keys(A.indexBy(people, "name")), ["David", "Rafael", "Aaron"]);
  assert.deepEqual(A.indexWith(["a", "b"], (x) => x.toUpperCase()), { a: "A", b: "B" });
  assert.deepEqual(A.indexWith(["a", "b"], null), { a: null, b: null });
  assert.equal(A.many([1]), false);
  assert.equal(A.many([1, 2]), true);
  assert.equal(A.many(people, (p) => p.age > 26), true);
  assert.equal(A.sum([1, 2, 3]), 6);
  assert.equal(A.sum(people, (p) => p.age), 95);
  assert.equal(A.sum(["foo", "bar"], undefined, ""), "foobar");
  assert.equal(A.sum([days(1), hours(1)], undefined, Duration.seconds(0)).inspect(), "1 day and 1 hour");
  assert.equal(A.sum([days(1), hours(1)]).inspect(), "1 day and 1 hour");
  assert.equal(A.sum([]), 0);
  assert.equal(A.sum(new Set([1, 2])), 3);
  assert.equal(A.many({ a: 1, b: 2 }), true);
  assert.equal(A.minimum(people, "age"), 25);
  assert.equal(A.maximum(people, (p) => p.age), 40);
  assert.deepEqual(A.excluding([1, 2, 3, 4], 2, 4), [1, 3]);
  assert.deepEqual(A.excluding([1, 2, 3], [1, 2]), [3]);
  assert.deepEqual(A.including([1, 2], [3, 4], 5), [1, 2, 3, 4, 5]);
  assert.deepEqual(A.compactBlank([1, "", null, 2, " ", [], {}, false, true]), [1, 2, true]);
  assert.deepEqual(A.compactBlank({ a: "", b: 1, c: null }), { b: 1 });
  assert.deepEqual(A.inOrderOf(people, "id", [3, 1]).map((p) => p.id), [3, 1]);
  assert.deepEqual(A.inOrderOf(people, "id", [3, 1], { filter: false }).map((p) => p.id), [3, 1, 2]);
  assert.equal(A.sole([1]), 1);
  assert.throws(() => A.sole([]), /no item found/);
  assert.throws(() => A.sole([1, 2]), /multiple items found/);
});

test("hash extensions", () => {
  assert.deepEqual(H.deepMerge({ a: { b: 1, c: { d: 1 } } }, { a: { c: { e: 2 } }, f: 3 }), { a: { b: 1, c: { d: 1, e: 2 } }, f: 3 });
  assert.deepEqual(H.deepMerge({ a: 1 }, { a: 2 }, (k, x, y) => x + y), { a: 3 });
  assert.deepEqual(H.reverseMerge({ a: 1 }, { a: 2, b: 2 }), { a: 1, b: 2 });
  assert.deepEqual(H.except({ a: 1, b: 2, c: 3 }, "b", "c"), { a: 1 });
  assert.deepEqual(H.slice({ a: 1, b: 2, c: 3 }, "a", "c", "z"), { a: 1, c: 3 });
  const h = { a: 1, b: 2 };
  assert.deepEqual(H.extract(h, "a"), { a: 1 });
  assert.deepEqual(h, { b: 2 });
  assert.deepEqual(H.deepTransformKeys({ user_name: { first_name: "x" }, list: [{ a_b: 1 }] }, (k) => I.camelize(k, false)),
    { userName: { firstName: "x" }, list: [{ aB: 1 }] });
  assert.deepEqual(H.deepTransformValues({ a: { b: 1 }, c: [2] }, (v) => v * 10), { a: { b: 10 }, c: [20] });
  assert.deepEqual(H.compact({ a: 1, b: null, c: undefined, d: false }), { a: 1, d: false });
  assert.throws(() => H.assertValidKeys({ name: "Rob", years: "28" }, "name", "age"), /Unknown key: "years". Valid keys are: "name", "age"/);
  assert.doesNotThrow(() => H.assertValidKeys({ name: "Rob" }, ["name", "age"]));
});

test("numeric extensions", () => {
  assert.equal(Num.megabytes(2), 2 * 1024 * 1024);
  assert.equal(Num.isMultipleOf(6, 3), true);
  assert.equal(Num.isMultipleOf(5, 0), false);
  assert.equal(Num.isMultipleOf(0, 0), true);
  assert.equal(Num.toFormattedS(1234567, "delimited"), "1,234,567");
  assert.equal(Num.toFormattedS(65, "percentage", { precision: 0 }), "65%");
  assert.equal(Num.toFormattedS(1234567, "human_size"), "1.18 MB");
});

test("date calculations", () => {
  const t = new Date(2024, 0, 31, 15, 30, 45, 123); // Wednesday
  const fmt = (d) => D.strftime(d, "%Y-%m-%d %H:%M:%S.%L");
  assert.equal(fmt(D.advance(t, { months: 1 })), "2024-02-29 15:30:45.123");
  assert.equal(fmt(D.advance(t, { years: 1, months: 1 })), "2025-02-28 15:30:45.123");
  assert.equal(fmt(D.advance(t, { weeks: 1.5 })), "2024-02-11 03:30:45.123");
  assert.equal(fmt(D.advance(t, { days: -31 })), "2023-12-31 15:30:45.123");
  assert.equal(fmt(D.change(t, { hour: 9 })), "2024-01-31 09:00:00.000");
  assert.equal(fmt(D.change(t, { min: 5 })), "2024-01-31 15:05:00.000");
  assert.equal(fmt(D.change(t, { year: 2020, month: 2, day: 29 })), "2020-02-29 15:30:45.123");
  assert.equal(fmt(D.beginningOfDay(t)), "2024-01-31 00:00:00.000");
  assert.equal(fmt(D.endOfDay(t)), "2024-01-31 23:59:59.999");
  assert.equal(fmt(D.middleOfDay(t)), "2024-01-31 12:00:00.000");
  assert.equal(fmt(D.beginningOfHour(t)), "2024-01-31 15:00:00.000");
  assert.equal(fmt(D.beginningOfWeek(t)), "2024-01-29 00:00:00.000");
  assert.equal(fmt(D.beginningOfWeek(t, "sunday")), "2024-01-28 00:00:00.000");
  assert.equal(fmt(D.endOfWeek(t)), "2024-02-04 23:59:59.999");
  assert.equal(fmt(D.beginningOfMonth(t)), "2024-01-01 00:00:00.000");
  assert.equal(fmt(D.endOfMonth(D.change(t, { month: 2, day: 1 }))), "2024-02-29 23:59:59.999");
  assert.equal(fmt(D.beginningOfQuarter(D.change(t, { month: 5 }))), "2024-04-01 00:00:00.000");
  assert.equal(fmt(D.endOfQuarter(t)), "2024-03-31 23:59:59.999");
  assert.equal(D.quarter(D.change(t, { month: 12 })), 4);
  assert.equal(fmt(D.beginningOfYear(t)), "2024-01-01 00:00:00.000");
  assert.equal(fmt(D.endOfYear(t)), "2024-12-31 23:59:59.999");
  assert.equal(fmt(D.nextWeek(t)), "2024-02-05 00:00:00.000");
  assert.equal(fmt(D.nextWeek(t, "friday")), "2024-02-09 00:00:00.000");
  assert.equal(fmt(D.nextWeek(t, "friday", { sameTime: true })), "2024-02-09 15:30:45.123");
  assert.equal(fmt(D.prevWeek(t)), "2024-01-22 00:00:00.000");
  assert.equal(fmt(D.nextOccurring(t, "wednesday")), "2024-02-07 15:30:45.123");
  assert.equal(fmt(D.prevOccurring(t, "monday")), "2024-01-29 15:30:45.123");
  assert.equal(fmt(D.nextWeekday(D.change(t, { day: 2, month: 2 }))), "2024-02-05 15:30:45.123");
  assert.equal(fmt(D.prevMonth(D.change(t, { month: 3 }))), "2024-02-29 15:30:45.123");
  assert.equal(D.daysInMonth(2, 2023), 28);
  assert.equal(D.daysInYear(2024), 366);
  assert.equal(D.isWeekend(D.change(t, { day: 3, month: 2 })), true);
  assert.equal(D.secondsSinceMidnight(D.change(t, { hour: 1 })), 3600);
  const [start, end] = D.allMonth(t);
  assert.equal(fmt(start), "2024-01-01 00:00:00.000");
  assert.equal(fmt(end), "2024-01-31 23:59:59.999");

  D.setBeginningOfWeek("sunday");
  assert.equal(fmt(D.beginningOfWeek(t)), "2024-01-28 00:00:00.000");
  D.setBeginningOfWeek("monday");
});

test("date calculations keep wall-clock time across DST", () => {
  const beforeSpring = new Date(2024, 2, 9, 12, 0); // day before US spring-forward
  assert.equal(D.strftime(D.advance(beforeSpring, { days: 1 }), "%Y-%m-%d %H:%M %z"), "2024-03-10 12:00 -0400");
  assert.equal(D.strftime(D.advance(beforeSpring, { hours: 24 }), "%Y-%m-%d %H:%M %z"), "2024-03-10 13:00 -0400");
});

test("date formatting", () => {
  const t = new Date(2007, 0, 18, 6, 10, 17);
  assert.equal(D.toFormattedS(t, "db"), "2007-01-18 06:10:17");
  assert.equal(D.toFormattedS(t, "number"), "20070118061017");
  assert.equal(D.toFormattedS(t, "short"), "18 Jan 06:10");
  assert.equal(D.toFormattedS(t, "long"), "January 18, 2007 06:10");
  assert.equal(D.toFormattedS(t, "long_ordinal"), "January 18th, 2007 06:10");
  assert.equal(D.toFormattedS(t, "rfc822"), "Thu, 18 Jan 2007 06:10:17 -0500");
  assert.equal(D.toFormattedS(t, "iso8601"), "2007-01-18T06:10:17-05:00");
  assert.equal(D.toFormattedS(t, "short", D.DATE_FORMATS), "18 Jan");
  assert.equal(D.toFormattedS(t, "long", D.DATE_FORMATS), "January 18, 2007");
  assert.equal(D.strftime(t, "%-d/%-m/%y %l%P %^a %e"), "18/1/07  6am THU 18");
  assert.equal(D.iso8601(t, 3), "2007-01-18T06:10:17.000-05:00");
  D.TIME_FORMATS.month_and_year = "%B %Y";
  assert.equal(D.toFormattedS(t, "month_and_year"), "January 2007");
});

test("durations", () => {
  const t = new Date(2024, 0, 31, 12);
  assert.equal(months(1).since(t).getDate(), 29);
  assert.equal(days(1).ago(t).getDate(), 30);
  assert.equal(years(1).plus(months(2)).inspect(), "1 year and 2 months");
  assert.equal(days(1).plus(60).inspect(), "1 day and 60 seconds");
  assert.equal(hours(2).minus(minutes(30)).inspect(), "2 hours and -30 minutes");
  assert.equal(hours(2).minus(minutes(30)).inMinutes(), 90);
  assert.equal(weeks(2).times(2).inspect(), "4 weeks");
  assert.equal(days(1).dividedBy(hours(1)), 24);
  assert.equal(days(1).dividedBy(2).inHours(), 12);
  assert.equal(days(1) > hours(23), true); // valueOf compares seconds
  assert.equal(days(1).compareTo(hours(24)), 0);
  assert.equal(days(1).isVariable(), true);
  assert.equal(hours(1).isVariable(), false);
  assert.equal(seconds(0).inspect(), "0 seconds");
  assert.equal(JSON.stringify({ d: minutes(1) }), '{"d":60}');
  assert.equal(Duration.parse("PT1.5S").value, 1.5);
  assert.throws(() => Duration.parse("garbage"), { name: "ISO8601ParsingError" });
  assert.throws(() => days(1).since("2020-01-01"), TypeError);
});
