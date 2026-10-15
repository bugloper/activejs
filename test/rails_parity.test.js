// Checks output parity against real ActiveSupport. The fixture is generated
// by script/generate_parity_fixture.rb; regenerate it after upgrading Rails.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as I from "../src/inflector/index.js";
import { toSentence } from "../src/core_ext/array.js";
import { truncate, truncateWords, squish } from "../src/core_ext/string.js";
import { toQuery } from "../src/core_ext/object.js";
import * as N from "../src/number_helper.js";
import { Duration, days, hours, months } from "../src/duration.js";
import { TimeZone } from "../src/time_zone.js";
import { htmlEscape, htmlEscapeOnce } from "../src/safe_buffer.js";
import { MessageVerifier, MessageEncryptor, KeyGenerator, Digest } from "../src/security.js";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/rails_parity.json", import.meta.url)));

const mapCases = (name, fn) => {
  test(`parity: ${name}`, () => {
    for (const [input, expected] of Object.entries(fixture[name])) {
      assert.equal(fn(input), expected, `${name}(${JSON.stringify(input)})`);
    }
  });
};

mapCases("pluralize", I.pluralize);
mapCases("singularize", I.singularize);
mapCases("camelize", (w) => I.camelize(w));
mapCases("camelize_lower", (w) => I.camelize(w, false));
mapCases("underscore", I.underscore);
mapCases("dasherize", (w) => I.dasherize(I.underscore(w)));
mapCases("tableize", I.tableize);
mapCases("classify", I.classify);
mapCases("humanize", (w) => I.humanize(w));
mapCases("humanize_keep_id", (w) => I.humanize(w, { keepIdSuffix: true }));
mapCases("titleize", (w) => I.titleize(w));
mapCases("foreign_key", (w) => I.foreignKey(w));
mapCases("parameterize", (w) => I.parameterize(w));
mapCases("parameterize_underscore", (w) => I.parameterize(w, { separator: "_" }));
mapCases("parameterize_preserve", (w) => I.parameterize(w, { preserveCase: true }));
mapCases("ordinalize", (n) => I.ordinalize(Number(n)));

const pairCases = (name, fn) => {
  test(`parity: ${name}`, () => {
    for (const [input, expected] of fixture[name]) {
      assert.equal(fn(input), expected, `${name}(${JSON.stringify(input)})`);
    }
  });
};

pairCases("to_sentence", (a) => toSentence(a));
pairCases("number_to_currency", (x) => N.numberToCurrency(x));
pairCases("number_to_delimited", (x) => N.numberToDelimited(x));
pairCases("number_to_rounded", (x) => N.numberToRounded(x));
pairCases("number_to_rounded_sig", (x) => N.numberToRounded(x, { significant: true, precision: 2 }));
pairCases("number_to_percentage", (x) => N.numberToPercentage(x));
pairCases("number_to_human", (x) => N.numberToHuman(x));
pairCases("number_to_human_size", (x) => N.numberToHumanSize(x));
pairCases("duration_build", (s) => Duration.build(s).inspect());
pairCases("squish", squish);
pairCases("html_escape", (s) => String(htmlEscape(s)));
pairCases("html_escape_once", (s) => String(htmlEscapeOnce(s)));
pairCases("to_query", (h) => toQuery(h));

test("parity: duration_parse", () => {
  for (const [input, expected] of fixture.duration_parse) {
    const d = Duration.parse(input);
    assert.equal(d.value, expected.value, `value of ${input}`);
    assert.equal(d.iso8601(), expected.iso8601, `iso8601 of ${input}`);
    assert.equal(d.inspect(), expected.inspect, `inspect of ${input}`);
  }
});

test("parity: truncate / truncateWords", () => {
  for (const [s, n, expected] of fixture.truncate) assert.equal(truncate(s, n), expected);
  for (const [s, n, expected] of fixture.truncate_separator) assert.equal(truncate(s, n, { separator: " " }), expected);
  for (const [s, n, expected] of fixture.truncate_words) assert.equal(truncateWords(s, n), expected);
});

test("parity: MessageVerifier reads and writes Rails JSON messages", () => {
  const v = new MessageVerifier("secret");
  const v256 = new MessageVerifier("secret", { digest: "SHA256" });
  assert.deepEqual(v.verify(fixture.message_verifier.sha1), { a: 1, b: [1, "two"] });
  assert.equal(v.generate({ a: 1, b: [1, "two"] }), fixture.message_verifier.sha1);
  assert.equal(v256.verify(fixture.message_verifier.sha256), "hello");
  assert.equal(v256.generate("hello"), fixture.message_verifier.sha256);
  assert.equal(v256.verified(fixture.message_verifier.purpose, { purpose: "login" }), "hi");
  assert.equal(v256.verified(fixture.message_verifier.purpose), undefined);
  assert.equal(v256.generate("hi", { purpose: "login" }), fixture.message_verifier.purpose);

  const expiresAt = new Date(Date.UTC(2100, 0, 2, 3, 4, 5, 678));
  assert.equal(v256.verified(fixture.message_verifier.expiring, { purpose: "login" }), "hi");
  assert.equal(v256.generate("hi", { purpose: "login", expiresAt }), fixture.message_verifier.expiring);
  assert.equal(v256.verified(fixture.message_verifier.expired, { purpose: "login" }), undefined);
});

test("parity: MessageVerifier reads and writes the legacy metadata envelope", () => {
  const legacy = new MessageVerifier("secret", { digest: "SHA256", useMessageSerializerForMetadata: false });
  const modern = new MessageVerifier("secret", { digest: "SHA256" });
  const expiresAt = new Date(Date.UTC(2100, 0, 2, 3, 4, 5, 678));
  assert.equal(legacy.generate("hi", { purpose: "login" }), fixture.message_verifier.legacy_purpose);
  assert.equal(legacy.generate("hi", { purpose: "login", expiresAt }), fixture.message_verifier.legacy_expiring);
  // Either verifier reads either format.
  assert.equal(modern.verified(fixture.message_verifier.legacy_purpose, { purpose: "login" }), "hi");
  assert.equal(modern.verified(fixture.message_verifier.legacy_expiring, { purpose: "login" }), "hi");
  assert.equal(modern.verified(fixture.message_verifier.legacy_purpose, { purpose: "other" }), undefined);
});

test("parity: KeyGenerator and MessageEncryptor interoperate with Rails", () => {
  const key = new KeyGenerator("secret_key_base", { iterations: 1000 }).generateKey("salt", 32);
  assert.equal(key.toString("hex"), fixture.message_encryptor.key_hex);
  const e = new MessageEncryptor(key);
  assert.deepEqual(e.decryptAndVerify(fixture.message_encryptor.message), { data: [1, 2, 3] });
  assert.equal(e.decryptAndVerify(fixture.message_encryptor.purpose, { purpose: "shipping" }), "secret");
  assert.equal(e.decryptAndVerify(fixture.message_encryptor.purpose, { purpose: "other" }), undefined);

  assert.deepEqual(new MessageEncryptor(key, { urlSafe: true }).decryptAndVerify(fixture.message_encryptor.url_safe), { data: "x".repeat(40) });
  const urlVerifier = new MessageVerifier("secret", { urlSafe: true });
  assert.equal(urlVerifier.verify(fixture.message_encryptor.url_safe_verifier), "??>>??");
  assert.equal(urlVerifier.generate("??>>??"), fixture.message_encryptor.url_safe_verifier);

  const cbc = new MessageEncryptor(key, { cipher: "aes-256-cbc" });
  assert.deepEqual(cbc.decryptAndVerify(fixture.message_encryptor.cbc_message), { data: [1, 2, 3] });
  assert.equal(cbc.decryptAndVerify(fixture.message_encryptor.cbc_purpose, { purpose: "shipping" }), "secret");
  assert.equal(cbc.decryptAndVerify(cbc.encryptAndSign("round trip")), "round trip");
  assert.throws(() => cbc.decryptAndVerify(fixture.message_encryptor.message), { name: "InvalidMessage" });

  assert.equal(new KeyGenerator("secret", { iterations: 1000 }).generateKey("salt").toString("hex"), fixture.key_generator.sha1_64);
  assert.equal(
    new KeyGenerator("secret", { iterations: 1000, hashDigestClass: "SHA256" }).generateKey("salt", 32).toString("hex"),
    fixture.key_generator.sha256_32,
  );
});

test("parity: Digest.hexdigest", () => {
  assert.equal(Digest.hexdigest("hello"), fixture.digest.hello);
});

test("parity: TimeZone / TimeWithZone across DST and calendar math", () => {
  for (const c of fixture.time_zone) {
    const zone = TimeZone.find(c.zone);
    const t = zone.local(...c.args);
    const label = `${c.zone} ${c.args.join(",")}`;
    assert.equal(t.toString(), c.to_s, `to_s ${label}`);
    assert.equal(t.xmlschema(3), c.xmlschema, `xmlschema ${label}`);
    assert.equal(t.plus(days(1)).toString(), c.plus_1_day, `+1.day ${label}`);
    assert.equal(t.plus(hours(24)).toString(), c.plus_24_hours, `+24.hours ${label}`);
    assert.equal(t.plus(months(1)).toString(), c.plus_1_month, `+1.month ${label}`);
    assert.equal(t.minus(hours(1)).toString(), c.minus_1_hour, `-1.hour ${label}`);
    assert.equal(t.beginningOfWeek().toString(), c.beginning_of_week, `beginning_of_week ${label}`);
    assert.equal(t.endOfMonth().toString(), c.end_of_month, `end_of_month ${label}`);
    assert.equal(t.beginningOfDay().toString(), c.beginning_of_day, `beginning_of_day ${label}`);
    assert.equal(t.endOfQuarter().toString(), c.end_of_quarter, `end_of_quarter ${label}`);
    assert.equal(t.strftime("%a %d %b %Y %H:%M:%S %z %:z %j %U %W %p %I %-m/%-d"), c.strftime, `strftime ${label}`);
    assert.equal(t.toFormattedS("db"), c.db, `to_fs(:db) ${label}`);
    assert.equal(t.toFormattedS("long_ordinal"), c.long_ordinal, `to_fs(:long_ordinal) ${label}`);
    assert.equal(t.utcOffset(), c.utc_offset, `utc_offset ${label}`);
    assert.equal(zone.toString(), c.zone_formatted, `zone to_s ${label}`);
  }
});

test("parity: TimeZone#parse", () => {
  for (const c of fixture.time_zone_parse) {
    assert.equal(TimeZone.find(c.zone).parse(c.input).toString(), c.to_s, `${c.zone} parse ${c.input}`);
  }
});
