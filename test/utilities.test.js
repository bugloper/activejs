process.env.TZ = "America/New_York";

import { test } from "node:test";
import assert from "node:assert/strict";
import { ParameterFilter } from "../src/parameter_filter.js";
import { BacktraceCleaner } from "../src/backtrace_cleaner.js";
import { htmlSafe, htmlEscape, isHtmlSafe, safeJoin, jsonEscape, xmlNameEscape, SafeBuffer } from "../src/safe_buffer.js";
import { Logger, TaggedLogging, BroadcastLogger } from "../src/logger.js";
import { encode, decode, asJson, Encoding } from "../src/json.js";
import { realtime, realtimeAsync, benchmark } from "../src/benchmark.js";
import { compress, decompress } from "../src/gzip.js";
import { travelTo, travel, freezeTime, travelBack, isTimeStubbed } from "../src/testing/time_helpers.js";
import { OrderedOptions, InheritableOptions } from "../src/ordered_options.js";
import { StringInquirer } from "../src/string_inquirer.js";
import { MessageVerifier, MessageEncryptor, KeyGenerator, CachingKeyGenerator, SecureRandom, secureCompare, InvalidSignature } from "../src/security.js";
import { TimeZone, TimeWithZone, Time, inTimeZone } from "../src/time_zone.js";
import { days, hours, minutes, Duration } from "../src/duration.js";

test("parameter filter", () => {
  const filter = new ParameterFilter(["password", /token/i, "card.code", (k, v) => (k === "secret" ? v.toUpperCase() : undefined)]);
  assert.deepEqual(
    filter.filter({ password: "p", user: { apiToken: "t", name: "n" }, card: { code: "1", number: "2" }, code: "keep", secret: "abc", list: [{ password: 1 }, "x"] }),
    { password: "[FILTERED]", user: { apiToken: "[FILTERED]", name: "n" }, card: { code: "[FILTERED]", number: "2" }, code: "keep", secret: "ABC", list: [{ password: "[FILTERED]" }, "x"] },
  );
  assert.equal(filter.filterParam("password", "x"), "[FILTERED]");
  assert.equal(new ParameterFilter(["ssn"], { mask: "***" }).filter({ ssn: 1 }).ssn, "***");
  assert.equal(new ParameterFilter([Symbol("ssn")]).filter({ ssn: 1 }).ssn, "[FILTERED]");
});

test("backtrace cleaner", () => {
  const bc = new BacktraceCleaner();
  const trace = [
    `at handler (${process.cwd()}/app/controllers/users.js:10:5)`,
    "at Module._compile (node:internal/modules/cjs/loader:1:1)",
    `at lib (${process.cwd()}/node_modules/express/lib/router.js:1:1)`,
  ];
  assert.deepEqual(bc.clean(trace), ["at handler (app/controllers/users.js:10:5)"]);
  assert.equal(bc.clean(trace, "noise").length, 2);
  bc.removeSilencers();
  bc.addSilencer((line) => line.includes("users.js"));
  assert.equal(bc.clean(trace).length, 2);
  assert.ok(Array.isArray(bc.clean(new Error("x"))));
});

test("safe buffer and escaping", () => {
  const buffer = htmlSafe("<b>").concat("<script>", htmlSafe("<i>"), 5);
  assert.ok(buffer instanceof SafeBuffer);
  assert.equal(String(buffer), "<b>&lt;script&gt;<i>5");
  assert.equal(String(htmlEscape(htmlSafe("<ok>"))), "<ok>");
  assert.equal(isHtmlSafe("<x>"), false);
  assert.equal(isHtmlSafe(1), true);
  assert.equal(String(safeJoin(["<p>", htmlSafe("<br>")], "<hr>")), "&lt;p&gt;&lt;hr&gt;<br>");
  assert.equal(String(htmlSafe("<p>%s</p>").format("<x>")), "<p>&lt;x&gt;</p>");
  assert.equal(jsonEscape('{"x":"</script>"}'), '{"x":"\\u003c/script\\u003e"}');
  assert.equal(xmlNameEscape("1 < 2 & 3"), "____2___3"); // verified against ERB::Util
  assert.equal(xmlNameEscape("valid-name"), "valid-name");
  assert.equal(JSON.stringify({ html: htmlSafe("<b>") }), '{"html":"<b>"}');
});

test("logger, tagged logging, silence, broadcast", async () => {
  const lines = [];
  const logger = TaggedLogging.new(new Logger(lines, { level: "info" }));
  logger.debug("hidden");
  logger.info("plain");
  logger.tagged("BCX", () => {
    logger.tagged("Jason", () => logger.info("nested"));
    logger.warn("one tag");
  });
  logger.tagged("A", "B").info("child logger");
  logger.silence("error", () => logger.warn("silenced"));
  logger.error(() => "lazy message");
  await Promise.all(["r1", "r2"].map((id, i) => logger.tagged(id, async () => {
    await new Promise((r) => setTimeout(r, (2 - i) * 5));
    logger.info("request");
  })));
  assert.deepEqual(lines, [
    "plain\n", "[BCX] [Jason] nested\n", "[BCX] one tag\n", "[A] [B] child logger\n", "lazy message\n",
    "[r2] request\n", "[r1] request\n",
  ]);
  assert.equal(logger.isDebug(), false);
  assert.equal(logger.isInfo(), true);

  const a = [];
  const b = [];
  const broadcast = new BroadcastLogger(new Logger(a), new Logger(b, { level: "warn" }));
  broadcast.info("to some");
  broadcast.error("to all");
  assert.deepEqual([a, b], [["to some\n", "to all\n"], ["to all\n"]]);
});

test("JSON encoding follows Rails' as_json", () => {
  const at = new Date(2024, 0, 31, 15, 30, 45, 123);
  const json = encode({ at, tags: new Set(["a"]), meta: new Map([["k", 1]]), big: 10n, nan: NaN, html: "<script>&", dur: minutes(2), fn() {} });
  assert.equal(json, '{"at":"2024-01-31T15:30:45.123-05:00","tags":["a"],"meta":{"k":1},"big":"10","nan":null,"html":"\\u003cscript\\u003e\\u0026","dur":120}');
  assert.deepEqual(asJson({ a: 1, b: 2, c: 3 }, { only: ["a", "b"] }), { a: 1, b: 2 });
  assert.equal(asJson({ asJson: () => "custom" }), "custom");
  assert.equal(asJson({ toJSON: () => "viaToJSON" }), "viaToJSON");
  Encoding.escapeHtmlEntitiesInJson = false;
  assert.equal(encode("<b>"), '"<b>"');
  Encoding.escapeHtmlEntitiesInJson = true;
  const decoded = decode('{"at":"2024-01-31T15:30:45.123Z","day":"2024-01-31","n":1}', { parseJsonTimes: true });
  assert.ok(decoded.at instanceof Date);
  assert.equal(decoded.at.toISOString(), "2024-01-31T15:30:45.123Z");
  assert.equal(decoded.day.getDate(), 31);
  assert.equal(encode(TimeZone.find("UTC").local(2024, 1, 2, 3, 4, 5)), '"2024-01-02T03:04:05.000Z"');
});

test("benchmark and gzip", async () => {
  assert.ok(realtime(() => {}) >= 0);
  assert.ok(realtime("float_millisecond", () => {}) >= 0);
  assert.ok((await realtimeAsync(async () => tick())) >= 0);
  assert.throws(() => realtime("parsecs", () => {}), /unknown unit/);
  const lines = [];
  assert.equal(benchmark(new Logger(lines), "Work", () => 42), 42);
  assert.match(lines[0], /^Work \(\d+\.\dms\)\n$/);

  const compressed = compress("hello hello hello");
  assert.ok(Buffer.isBuffer(compressed));
  assert.equal(decompress(compressed), "hello hello hello");
});

const tick = () => new Promise((r) => setImmediate(r));

test("time helpers stub and restore the clock", async () => {
  travelTo(new Date(2004, 10, 24, 1, 4, 44, 555));
  assert.equal(new Date().getTime(), new Date(2004, 10, 24, 1, 4, 44).getTime(), "subseconds dropped");
  assert.equal(Date.now(), new Date(2004, 10, 24, 1, 4, 44).getTime());
  travel(days(1), () => assert.equal(new Date().getDate(), 25));
  assert.equal(new Date().getDate(), 24);
  assert.equal(days(2).fromNow().getDate(), 26);
  travelBack();
  assert.equal(isTimeStubbed(), false);
  assert.ok(new Date().getFullYear() > 2020);

  await freezeTime(async () => {
    const frozen = Date.now();
    await new Promise((r) => setTimeout(r, 15));
    assert.equal(Date.now(), frozen);
  });
  assert.equal(isTimeStubbed(), false);
  const before = new Date();
  travelTo(new Date(2000, 0, 1), { withUsec: true }, () => assert.ok(before instanceof Date));
});

test("ordered and inheritable options", () => {
  const o = new OrderedOptions({ a: 1 });
  o.b = 2;
  assert.equal(o.aBang(), 1);
  assert.throws(() => o.cBang(), /:c is blank/);
  assert.equal(o.fetch("a"), 1);
  assert.equal(o.fetch("z", 9), 9);
  assert.throws(() => o.fetch("z"), { name: "KeyError" });
  assert.deepEqual(JSON.parse(JSON.stringify(o)), { a: 1, b: 2 });
  const child = new InheritableOptions(o);
  child.c = 3;
  assert.equal(child.a, 1);
  assert.equal(child.c, 3);
  assert.equal(o.c, undefined);
  assert.equal("a" in child, true);

  const s = new StringInquirer("staging");
  assert.equal(s.staging(), true);
  assert.equal(s.length, 7);
});

test("security helpers", async () => {
  const v = new MessageVerifier("s3cr3t", { digest: "SHA256", urlSafe: true });
  const token = v.generate({ id: 1 }, { expiresIn: minutes(1) });
  assert.match(token, /^[A-Za-z0-9_=-]+--[0-9a-f]{64}$/);
  assert.deepEqual(v.verify(token), { id: 1 });
  assert.equal(v.isValidMessage(token), true);
  assert.equal(v.isValidMessage(`${token}0`), false);
  assert.throws(() => v.verify("garbage"), InvalidSignature);
  assert.throws(() => new MessageVerifier(""), /Secret should not be nil/);

  travelTo(new Date(), () => {
    const expiring = v.generate("x", { expiresIn: Duration.seconds(10) });
    travel(Duration.seconds(11), () => assert.equal(v.verified(expiring), undefined));
    assert.equal(v.verified(expiring), "x");
  });

  const key = new CachingKeyGenerator(new KeyGenerator("base", { iterations: 10 }));
  assert.equal(key.generateKey("salt", 32), key.generateKey("salt", 32));
  const enc = new MessageEncryptor(key.generateKey("salt", 32), { urlSafe: true });
  const box = enc.encryptAndSign([1, "two"], { purpose: "p" });
  assert.deepEqual(enc.decryptAndVerify(box, { purpose: "p" }), [1, "two"]);
  assert.throws(() => enc.decryptAndVerify(`${box}x`), { name: "InvalidMessage" });
  assert.throws(() => new MessageEncryptor("short"), /key must be 32 bytes/);

  assert.match(SecureRandom.base58(), /^[1-9A-HJ-NP-Za-km-z]{16}$/);
  assert.match(SecureRandom.base36(24), /^[0-9a-z]{24}$/);
  assert.match(SecureRandom.alphanumeric(10), /^[A-Za-z0-9]{10}$/);
  assert.match(SecureRandom.hex(4), /^[0-9a-f]{8}$/);
  assert.match(SecureRandom.uuid(), /^[0-9a-f-]{36}$/);
  assert.equal(secureCompare("abc", "abc"), true);
  assert.equal(secureCompare("abc", "abd"), false);
});

test("time zones: Time.zone, useZone, find, conversions", async () => {
  assert.equal(Time.zone, undefined);
  assert.ok(Time.current() instanceof Date);
  Time.zone = "Hawaii";
  assert.ok(Time.current() instanceof TimeWithZone);
  assert.equal(Time.current().timeZone.name, "Hawaii");
  const names = await Promise.all(["Tokyo", "London"].map((zone) => Time.useZone(zone, async () => {
    await tick();
    return Time.zone.name;
  })));
  assert.deepEqual(names, ["Tokyo", "London"]);
  assert.equal(Time.zone.name, "Hawaii");
  assert.throws(() => { Time.zone = "Atlantis"; }, /Invalid Timezone/);
  Time.zone = null;

  assert.equal(TimeZone.find("America/Chicago").tzinfo, "America/Chicago");
  assert.equal(TimeZone.find("Nowhere/Special"), undefined);
  assert.equal(TimeZone.find("Mumbai").formattedOffset(), "+05:30");
  assert.equal(TimeZone.usZones().length, 8);

  const utc = new Date(Date.UTC(2024, 6, 1, 12));
  const ny = inTimeZone(utc, "Eastern Time (US & Canada)");
  assert.equal(ny.hour, 8);
  assert.equal(ny.isDst(), true);
  assert.equal(ny.zone(), "EDT");
  assert.equal(ny.inTimeZone("Tokyo").toString(), "2024-07-01 21:00:00 +0900");
  assert.equal(ny.utc().getTime(), utc.getTime());
  assert.equal(ny.equals(utc), true);
  assert.equal(ny.minus(hours(2)).hour, 6);
  assert.equal(ny.minus(inTimeZone(new Date(Date.UTC(2024, 6, 1, 11)), "UTC")), 3600);
  assert.equal(ny.change({ hour: 0 }).toString(), "2024-07-01 00:00:00 -0400");
  // Verified against Rails: wall time is kept, the zone changes.
  assert.equal(ny.change({ hour: 12, offset: "+09:00" }).toString(), "2024-07-01 12:00:00 +0900");
  assert.equal(ny.change({ hour: 12, offset: 19800 }).toString(), "2024-07-01 12:00:00 +0530");
  assert.equal(ny.change({ hour: 12, zone: "Tokyo" }).timeZone.name, "Tokyo");
  assert.throws(() => ny.change({ zone: "Tokyo", offset: 0 }), /Can't change both/);
  assert.equal(TimeZone.find("UTC").at(0).toString(), "1970-01-01 00:00:00 UTC");
  assert.equal(TimeZone.find("Tokyo").parse("10:30", ny.inTimeZone("Tokyo")).toString(), "2024-07-01 10:30:00 +0900");
  assert.throws(() => TimeZone.find("Tokyo").iso8601("July 4th"), RangeError);
  assert.equal(new Date(2024, 0, 1) < ny, true, "TimeWithZone compares by instant via valueOf");
});

test("prototype extensions (activejs/core_ext)", async () => {
  // Install explicitly: the module may already be loaded (and uninstalled) by
  // another test file when a runner shares one process across files.
  const { install, uninstall } = await import("../src/core_ext/register.js");
  install();
  try {
    assert.equal("person".pluralize(), "people");
    assert.equal("ActiveModel::Errors".underscore(), "active_model/errors");
    assert.equal("active_model".camelize("lower"), "activeModel");
    assert.equal("hello".at(0), "h", "native String#at is not overridden");
    assert.equal("   ".isBlank(), true);
    assert.equal([].isBlank(), true);
    assert.equal((0).isPresent(), true);
    assert.equal("x".presence(), "x");
    assert.equal("Hello World".truncate(8), "Hello...");
    assert.equal("production".inquiry().production(), true);
    assert.equal(["phone"].inquiry().phone(), true);
    assert.equal([1, 2, 3].toSentence(), "1, 2, and 3");
    assert.deepEqual([1, 2, 3, 4].inGroupsOf(2), [[1, 2], [3, 4]]);
    assert.equal([{ n: 1 }, { n: 2 }].sum((x) => x.n), 3);
    assert.equal(new Set([1, 2]).many(), true);
    assert.equal((2).days().inspect(), "2 days");
    assert.equal((1).hour().inSeconds(), 3600);
    assert.equal((5).megabytes(), 5242880);
    assert.equal((22).ordinalize(), "22nd");
    assert.equal((1234.5).numberToCurrency(), "$1,234.50");
    assert.equal((1234567).toFs("human"), "1.23 Million");
    const d = new Date(2024, 0, 31, 12);
    assert.equal(d.plus((1).month()).getDate(), 29);
    assert.equal(d.minus((1).day()).getDate(), 30);
    assert.equal(d.minus(new Date(2024, 0, 31, 11)), 3600);
    assert.equal(d.beginningOfMonth().getDate(), 1);
    assert.equal(d.toFs("db"), "2024-01-31 12:00:00");
    assert.equal(d.inTimeZone("Tokyo").toString(), "2024-02-01 02:00:00 +0900");
    assert.equal(Object.keys(String.prototype).length, 0, "extensions are non-enumerable");
    for (const _ in []) assert.fail("for...in must not see extensions");
  } finally {
    uninstall();
  }
  assert.equal("person".pluralize, undefined);
});

test("url-safe encrypted messages survive '--' inside the base64url payload", () => {
  const enc = new MessageEncryptor(new KeyGenerator("base", { iterations: 10 }).generateKey("salt", 32), { urlSafe: true });
  const cbc = new MessageEncryptor(new KeyGenerator("base", { iterations: 10 }).generateKey("salt", 32), { urlSafe: true, cipher: "aes-256-cbc" });
  let sawDashes = false;
  for (let i = 0; i < 2000; i++) {
    const value = { i, pad: "x".repeat(i % 50) };
    const box = enc.encryptAndSign(value);
    if (box.split("--").length > 3) sawDashes = true;
    assert.deepEqual(enc.decryptAndVerify(box), value);
    if (i % 10 === 0) assert.deepEqual(cbc.decryptAndVerify(cbc.encryptAndSign(value)), value);
  }
  assert.ok(sawDashes, "the sample should include payloads containing '--'");
});
