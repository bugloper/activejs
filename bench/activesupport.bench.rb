# Ruby side of the benchmarks: the same case ids and inputs as
# activejs.bench.js, run against real ActiveSupport with benchmark-ips.
#
# Prints JSON: { caseId => { "Rails ActiveSupport" => ips } }
require "active_support/all"
require "active_support/message_verifier"
require "active_support/message_encryptor"
require "benchmark/ips"
require "json"

date = Time.local(2024, 1, 31, 15, 30, 45)
cache = ActiveSupport::Cache::MemoryStore.new
cache.write("hit", { id: 1, name: "cached" })
verifier = ActiveSupport::MessageVerifier.new("secret", digest: "SHA256", serializer: JSON)
key = ActiveSupport::KeyGenerator.new("secret_key_base", iterations: 1000).generate_key("salt", 32)
encryptor = ActiveSupport::MessageEncryptor.new(key, cipher: "aes-256-gcm", serializer: JSON)
payload = { id: 1, name: "David", tags: %w[a b], created_at: date, nested: { ok: true, n: 1.5 } }
zone = ActiveSupport::TimeZone["Eastern Time (US & Canada)"]

class Record
  include ActiveSupport::Callbacks
  define_callbacks :save
  set_callback :save, :before, :a
  set_callback :save, :before, :b
  set_callback :save, :after, :c
  def a; end
  def b; end
  def c; end
end
record = Record.new

CASES = {
  "pluralize" => -> { "octopus".pluralize },
  "singularize" => -> { "people".singularize },
  "camelize" => -> { "active_model_errors".camelize(:lower) },
  "underscore" => -> { "ActiveModelErrors".underscore },
  "titleize" => -> { "man from the boondocks".titleize },
  "parameterize" => -> { "Donald E. Knuth & Crème brûlée".parameterize },
  "number_to_currency" => -> { ActiveSupport::NumberHelper.number_to_currency(1234567.891) },
  "number_to_delimited" => -> { ActiveSupport::NumberHelper.number_to_delimited(12345678) },
  "number_to_human_size" => -> { ActiveSupport::NumberHelper.number_to_human_size(1234567) },
  "beginning_of_month" => -> { date.beginning_of_month },
  "advance_1_month" => -> { date.advance(months: 1) },
  "strftime" => -> { date.strftime("%Y-%m-%d %H:%M:%S") },
  "duration_parse" => -> { ActiveSupport::Duration.parse("P3Y6M4DT12H30M5S") },
  "duration_inspect" => -> { (2.days + 3.hours).inspect },
  "time_zone_local_plus_hour" => -> { zone.local(2024, 3, 10, 1, 30) + 1.hour },
  "truncate" => -> { "Once upon a time in a world far far away".truncate(27, separator: " ") },
  "squish" => -> { "  foo   bar  \n  \t  boo  ".squish },
  "to_sentence" => -> { %w[one two three four].to_sentence },
  "blank" => -> { "   ".blank? },
  "cache_fetch_hit" => -> { cache.fetch("hit") { nil } },
  "message_verifier" => -> { verifier.verify(verifier.generate({ id: 1, role: "admin" })) },
  "message_encryptor" => -> { encryptor.decrypt_and_verify(encryptor.encrypt_and_sign({ id: 1, role: "admin" })) },
  "json_encode" => -> { ActiveSupport::JSON.encode(payload) },
  "run_callbacks" => -> { record.run_callbacks(:save) { true } },
}

report = Benchmark.ips(quiet: true) do |x|
  x.config(warmup: 1, time: 2)
  CASES.each { |id, fn| x.report(id) { fn.call } }
end

puts JSON.generate(report.entries.to_h { |e| [e.label, { "Rails ActiveSupport" => e.ips.round }] })
