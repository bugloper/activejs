// JS side of the benchmarks. Every case id here has a Ruby counterpart in
// activesupport.bench.rb with the same inputs; run.js joins them by id.
//
// Prints JSON: { [caseId]: { [implementation]: opsPerSecond } }
import { bench, run, do_not_optimize } from "mitata";
import pluralizeLib from "pluralize";
import { startOfMonth, addMonths, format } from "date-fns";
import lodash from "lodash";
import * as AJ from "../src/index.js";
import { MemoryStore } from "../src/cache.js";
import { install } from "../src/core_ext/register.js";

install();

const date = new Date(2024, 0, 31, 15, 30, 45);
const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const cache = new MemoryStore();
cache.write("hit", { id: 1, name: "cached" });
const verifier = new AJ.MessageVerifier("secret", { digest: "SHA256" });
const key = new AJ.KeyGenerator("secret_key_base", { iterations: 1000 }).generateKey("salt", 32);
const encryptor = new AJ.MessageEncryptor(key);
const payload = { id: 1, name: "David", tags: ["a", "b"], created_at: date, nested: { ok: true, n: 1.5 } };
AJ.Time.zone = "Eastern Time (US & Canada)";
const zone = AJ.Time.zone;

class Record extends AJ.Callbacks() {
  static {
    this.defineCallbacks("save");
    this.setCallback("save", "before", "a");
    this.setCallback("save", "before", "b");
    this.setCallback("save", "after", "c");
  }
  a() {}
  b() {}
  c() {}
}
const record = new Record();

// [caseId, implementation, fn]
const CASES = [
  ["pluralize", "activejs", () => AJ.pluralize("octopus")],
  ["pluralize", "activejs (method)", () => "octopus".pluralize()],
  ["pluralize", "pluralize (npm)", () => pluralizeLib("octopus")],
  ["singularize", "activejs", () => AJ.singularize("people")],
  ["singularize", "pluralize (npm)", () => pluralizeLib.singular("people")],
  ["camelize", "activejs", () => AJ.camelize("active_model_errors", false)],
  ["camelize", "lodash camelCase", () => lodash.camelCase("active_model_errors")],
  ["underscore", "activejs", () => AJ.underscore("ActiveModelErrors")],
  ["underscore", "lodash snakeCase", () => lodash.snakeCase("ActiveModelErrors")],
  ["titleize", "activejs", () => AJ.titleize("man from the boondocks")],
  ["titleize", "lodash startCase", () => lodash.startCase("man from the boondocks")],
  ["parameterize", "activejs", () => AJ.parameterize("Donald E. Knuth & Crème brûlée")],
  ["parameterize", "lodash kebabCase", () => lodash.kebabCase("Donald E. Knuth & Crème brûlée")],

  ["number_to_currency", "activejs", () => AJ.numberToCurrency(1234567.891)],
  ["number_to_currency", "Intl.NumberFormat", () => currency.format(1234567.891)],
  ["number_to_delimited", "activejs", () => AJ.numberToDelimited(12345678)],
  ["number_to_delimited", "toLocaleString", () => (12345678).toLocaleString("en-US")],
  ["number_to_human_size", "activejs", () => AJ.numberToHumanSize(1234567)],

  ["beginning_of_month", "activejs", () => AJ.DateExt.beginningOfMonth(date)],
  ["beginning_of_month", "date-fns", () => startOfMonth(date)],
  ["advance_1_month", "activejs", () => AJ.DateExt.advance(date, { months: 1 })],
  ["advance_1_month", "date-fns", () => addMonths(date, 1)],
  ["strftime", "activejs", () => AJ.strftime(date, "%Y-%m-%d %H:%M:%S")],
  ["strftime", "date-fns", () => format(date, "yyyy-MM-dd HH:mm:ss")],
  ["duration_parse", "activejs", () => AJ.Duration.parse("P3Y6M4DT12H30M5S")],
  ["duration_inspect", "activejs", () => AJ.days(2).plus(AJ.hours(3)).inspect()],
  ["time_zone_local_plus_hour", "activejs", () => zone.local(2024, 3, 10, 1, 30).plus(AJ.hours(1))],

  ["truncate", "activejs", () => AJ.truncate("Once upon a time in a world far far away", 27, { separator: " " })],
  ["squish", "activejs", () => AJ.squish("  foo   bar  \n  \t  boo  ")],
  ["to_sentence", "activejs", () => AJ.toSentence(["one", "two", "three", "four"])],
  ["blank", "activejs", () => AJ.isBlank("   ")],

  ["cache_fetch_hit", "activejs", () => cache.fetch("hit", () => null)],
  ["message_verifier", "activejs", () => verifier.verify(verifier.generate({ id: 1, role: "admin" }))],
  ["message_encryptor", "activejs", () => encryptor.decryptAndVerify(encryptor.encryptAndSign({ id: 1, role: "admin" }))],
  ["json_encode", "activejs", () => AJ.JSON.encode(payload)],
  ["json_encode", "JSON.stringify", () => JSON.stringify(payload)],
  ["run_callbacks", "activejs", () => record.runCallbacks("save", () => true)],
];

for (const [id, impl, fn] of CASES) {
  bench(`${id}|${impl}`, () => do_not_optimize(fn()));
}

const results = await run({ format: "quiet", throw: true });
const out = {};
for (const b of results.benchmarks) {
  const [id, impl] = b.alias.split("|");
  out[id] ??= {};
  out[id][impl] = Math.round(1e9 / b.runs[0].stats.avg);
}
console.log(JSON.stringify(out));
