// Runs the JS and Ruby benchmarks and prints a markdown table.
//
//   node run.js           # print the table
//   node run.js --write   # also replace the table in ../README.md
//
// The Ruby side needs activesupport and benchmark-ips; without them only
// the JS columns are filled in.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import os from "node:os";

const here = new URL(".", import.meta.url).pathname;

const LABELS = {
  pluralize: '`pluralize("octopus")`',
  singularize: '`singularize("people")`',
  camelize: '`camelize("active_model_errors", false)`',
  underscore: '`underscore("ActiveModelErrors")`',
  titleize: '`titleize("man from the boondocks")`',
  parameterize: '`parameterize("Donald E. Knuth & Crème brûlée")`',
  number_to_currency: "`numberToCurrency(1234567.891)`",
  number_to_delimited: "`numberToDelimited(12345678)`",
  number_to_human_size: "`numberToHumanSize(1234567)`",
  beginning_of_month: "`beginningOfMonth(date)`",
  advance_1_month: "`advance(date, { months: 1 })`",
  strftime: '`strftime(date, "%Y-%m-%d %H:%M:%S")`',
  duration_parse: '`Duration.parse("P3Y6M4DT12H30M5S")`',
  duration_inspect: "`days(2).plus(hours(3)).inspect()`",
  time_zone_local_plus_hour: "`zone.local(2024, 3, 10, 1, 30).plus(hours(1))`",
  truncate: "`truncate(text, 27, { separator: \" \" })`",
  squish: "`squish(text)`",
  to_sentence: "`toSentence([4 words])`",
  blank: '`isBlank("   ")`',
  cache_fetch_hit: "`MemoryStore#fetch` (hit)",
  message_verifier: "`MessageVerifier` generate + verify",
  message_encryptor: "`MessageEncryptor` encrypt + decrypt",
  json_encode: "`JSON.encode(record)`",
  run_callbacks: "`runCallbacks` (2 before, 1 after)",
};

const js = JSON.parse(execFileSync(process.execPath, ["activejs.bench.js"], { cwd: here, encoding: "utf8" }));

let ruby = {};
let rubyVersion = "";
try {
  ruby = JSON.parse(execFileSync("ruby", ["activesupport.bench.rb"], { cwd: here, encoding: "utf8" }));
  rubyVersion = execFileSync("ruby", ["-e", 'require "active_support"; print "Ruby #{RUBY_VERSION}, ActiveSupport #{ActiveSupport::VERSION::STRING}"'], { encoding: "utf8" });
} catch {
  console.error("Ruby/ActiveSupport/benchmark-ips not available; skipping the Rails column.");
}

const fmt = (ops) => {
  if (ops === undefined) return "—";
  if (ops >= 1e6) return `${(ops / 1e6).toFixed(2)}M`;
  if (ops >= 1e3) return `${(ops / 1e3).toFixed(1)}K`;
  return String(ops);
};

const rows = [];
for (const [id, label] of Object.entries(LABELS)) {
  const impls = js[id] ?? {};
  const ours = impls.activejs;
  const rails = ruby[id]?.["Rails ActiveSupport"];
  const vsRails = ours && rails ? `${(ours / rails).toFixed(1)}×` : "—";
  const others = Object.entries(impls)
    .filter(([name]) => name !== "activejs")
    .map(([name, ops]) => `${name}: ${fmt(ops)}`)
    .join("<br>") || "—";
  rows.push(`| ${label} | ${fmt(ours)} | ${fmt(rails)} | ${vsRails} | ${others} |`);
}

const cpu = os.cpus()[0]?.model ?? os.arch();
const env = [`Node ${process.version}`, rubyVersion, cpu].filter(Boolean).join(", ");
const table = [
  `Operations per second (higher is better), measured on ${env}.`,
  "",
  "| Operation | activejs | Rails ActiveSupport | activejs vs Rails | Other JS |",
  "| --- | ---: | ---: | ---: | --- |",
  ...rows,
].join("\n");

console.log(table);

if (process.argv.includes("--write")) {
  const readmePath = new URL("../README.md", import.meta.url);
  const readme = readFileSync(readmePath, "utf8");
  const start = "<!-- bench:start -->";
  const end = "<!-- bench:end -->";
  if (!readme.includes(start) || !readme.includes(end)) throw new Error("README is missing the bench markers");
  const updated = readme.replace(new RegExp(`${start}[\\s\\S]*?${end}`), `${start}\n${table}\n${end}`);
  writeFileSync(readmePath, updated);
  console.error("README.md updated.");
}
