# Regenerates test/fixtures/rails_parity.json from real ActiveSupport so the
# JS test suite can check output parity without needing Ruby installed.
#
#   ruby script/generate_parity_fixture.rb
require "active_support"
require "active_support/all"
require "active_support/message_verifier"
require "active_support/message_encryptor"
require "json"

WORDS = %w[
  search switch fix box process address case stack wish fish jeans funky jeans my money
  category query ability agency movie archive index wife safe half perspective
  person people man men child children sex move cow zombie
  octopus virus alias status bus buffalo tomato tomatoes datum medium stadium analysis
  analyses basis diagnosis parenthesis prognosis synopsis thesis axis crisis testis
  hive news series species information equipment rice sheep police
  shoe horse prize edge database matrix vertex index mouse louse ox oxen quiz
  user post comment admin_user Person PERSON Status Mouse Quiz
  dwarf elf leaf loaf thief wolf knife life knives elves halves
  photo piano hero potato echo veto
  day toy key boy guy story city fly sky
  bus campus virus cactus focus
  criterion phenomenon
  sms dish bench church kiss glass
  ""
]

CAMEL = %w[
  Product SpecialGuest ApplicationController Area51Controller
  active_model active_model/errors html_tidy HTMLTidy HTMLTidyGenerator
  ActiveModel::Errors ActiveModel area51_controller product special_guest
  application_controller CamelOctopi camel_octopus FreeBSD HTML
  Capital capital_city CapitalCity SSLError ssl_error PhDRequired phd_required
  CamelCase Camel_Case camel_case camel-case Camel-Case
]

HUMAN = %w[employee_salary author_id underground _id author_comments_count employee_id_number]

TITLE = [
  "active_record", "ActiveRecord", "action web service", "Action Web Service", "Action web service",
  "actionwebservice", "Actionwebservice", "david's code", "David's code", "david's Code",
  "sgt. pepper's", "i've just seen a face", "maybe you'll be there", "¿por qué?", "Fred’s",
  "Fred`s", "x-men: the last stand", "TWO WORDS", "man from the boondocks", "raiders_of_the_lost_ark",
]

PARAM = [
  "Donald E. Knuth", "Random text with *(bad)* characters", "Allow_Under_Scores",
  "Trailing bad characters!@#", "!@#Leading bad characters", "Squeeze   separators",
  "Test with + sign",
  "^très|Jolie-- ", "Ærøskøbing", "Straße", "Ünïcödé", "Crème brûlée",
]

ORDINALS = [-1, 0, 1, 2, 3, 4, 10, 11, 12, 13, 14, 21, 22, 23, 100, 101, 102, 103, 111, 112, 113, 1000, 1001, 1011, 1012]

NUMBERS = [0, 1, -1, 0.5, 1.005, 12.345, 123.456, -123.456, 1234, 12345, 123456, 1234567, -1234567.891,
           999999, 1_000_000, 1_234_567_890, 1_234_567_890_123, 0.001, 0.0001, 98.765, 100, 302.24398923423]

SIZES = [0, 1, 123, 1023, 1024, 1234, 12345, 1234567, 1234567890, 1234567890123, 1_125_899_906_842_624, 444 * 1024 ** 3]

SENTENCES = [[], ["one"], ["one", "two"], ["one", "two", "three"], %w[a b c d]]

DURATIONS = %w[P1Y P1M P1W P1D PT1H PT1M PT1S P3Y6M4DT12H30M5S P1Y2M10DT2H30M PT0.5S P1DT0.5H -P1D P0D PT0S P2W]

fixture = {
  "pluralize" => WORDS.to_h { |w| [w, w.pluralize] },
  "singularize" => (WORDS + WORDS.map(&:pluralize)).uniq.to_h { |w| [w, w.singularize] },
  "camelize" => CAMEL.to_h { |w| [w, w.camelize] },
  "camelize_lower" => CAMEL.to_h { |w| [w, w.camelize(:lower)] },
  "underscore" => CAMEL.to_h { |w| [w, w.underscore] },
  "dasherize" => CAMEL.to_h { |w| [w, w.underscore.dasherize] },
  "tableize" => CAMEL.to_h { |w| [w, w.tableize] },
  "classify" => (CAMEL + %w[schema.posts ham_and_eggs posts]).to_h { |w| [w, w.classify] },
  "humanize" => HUMAN.to_h { |w| [w, w.humanize] },
  "humanize_keep_id" => HUMAN.to_h { |w| [w, w.humanize(keep_id_suffix: true)] },
  "titleize" => TITLE.to_h { |w| [w, w.titleize] },
  "foreign_key" => (CAMEL.select { |c| c =~ /\A[A-Z]/ }).to_h { |w| [w, w.foreign_key] },
  "parameterize" => PARAM.to_h { |w| [w, w.parameterize] },
  "parameterize_underscore" => PARAM.to_h { |w| [w, w.parameterize(separator: "_")] },
  "parameterize_preserve" => PARAM.to_h { |w| [w, w.parameterize(preserve_case: true)] },
  "ordinalize" => ORDINALS.to_h { |i| [i.to_s, i.ordinalize] },
  "to_sentence" => SENTENCES.map { |a| [a, a.to_sentence] },
  "number_to_currency" => NUMBERS.map { |x| [x, ActiveSupport::NumberHelper.number_to_currency(x)] },
  "number_to_delimited" => NUMBERS.map { |x| [x, ActiveSupport::NumberHelper.number_to_delimited(x)] },
  "number_to_rounded" => NUMBERS.map { |x| [x, ActiveSupport::NumberHelper.number_to_rounded(x)] },
  "number_to_rounded_sig" => NUMBERS.map { |x| [x, ActiveSupport::NumberHelper.number_to_rounded(x, significant: true, precision: 2)] },
  "number_to_percentage" => NUMBERS.map { |x| [x, ActiveSupport::NumberHelper.number_to_percentage(x)] },
  "number_to_human" => NUMBERS.map { |x| [x, ActiveSupport::NumberHelper.number_to_human(x)] },
  "number_to_human_size" => SIZES.map { |x| [x, ActiveSupport::NumberHelper.number_to_human_size(x)] },
  "duration_parse" => DURATIONS.map { |s| d = ActiveSupport::Duration.parse(s); [s, { "value" => d.to_f, "iso8601" => d.iso8601, "inspect" => d.inspect }] },
  "duration_build" => [0, 1, 59, 60, 3600, 86_400, 90_061, 2_716_146, 31_556_952, 100_000_000].map { |s| [s, ActiveSupport::Duration.build(s).inspect] },
  "truncate" => [["Hello World!", 12], ["Hello World!!", 12], ["Once upon a time in a world far far away", 27]].map { |s, n| [s, n, s.truncate(n)] },
  "truncate_separator" => [["Once upon a time in a world far far away", 27]].map { |s, n| [s, n, s.truncate(n, separator: " ")] },
  "truncate_words" => [["Once upon a time in a world far far away", 4], ["Hello Big World!", 3], ["Hello Big World!", 2]].map { |s, n| [s, n, s.truncate_words(n)] },
  "squish" => ["  foo   bar  \n  \t  boo", " multi\n\nline  "].map { |s| [s, s.squish] },
  "html_escape" => ["<script>alert('x')</script>", "a & b \"c\"", "plain"].map { |s| [s, ERB::Util.html_escape(s).to_str] },
  "html_escape_once" => ["1 < 2 &amp; 3", "&lt;&gt;", "&#39; &#x27; &foo;"].map { |s| [s, ERB::Util.html_escape_once(s).to_str] },
  "to_query" => [
    [{ "name" => "David", "nationality" => "Danish" }, { "name" => "David", "nationality" => "Danish" }.to_query],
    [{ "a" => [1, 2], "b" => { "c" => "d e" } }, { "a" => [1, 2], "b" => { "c" => "d e" } }.to_query],
    [{ "p" => { "q" => [1, { "r" => 2 }] } }, { "p" => { "q" => [1, { "r" => 2 }] } }.to_query],
    [{ "empty" => [], "nested" => {}, "z" => "1" }, { "empty" => [], "nested" => {}, "z" => "1" }.to_query],
  ],
  "message_verifier" => begin
    v = ActiveSupport::MessageVerifier.new("secret", serializer: JSON)
    v256 = ActiveSupport::MessageVerifier.new("secret", serializer: JSON, digest: "SHA256")
    expiring = { purpose: "login", expires_at: Time.utc(2100, 1, 2, 3, 4, 5.678r) }
    ActiveSupport::Messages::Metadata.use_message_serializer_for_metadata = false
    legacy = { "legacy_purpose" => v256.generate("hi", purpose: "login"), "legacy_expiring" => v256.generate("hi", **expiring) }
    ActiveSupport::Messages::Metadata.use_message_serializer_for_metadata = true
    { "sha1" => v.generate({ "a" => 1, "b" => [1, "two"] }), "sha256" => v256.generate("hello"),
      "purpose" => v256.generate("hi", purpose: "login"), "expiring" => v256.generate("hi", **expiring),
      "expired" => v256.generate("hi", purpose: "login", expires_at: Time.utc(2001, 1, 1)), **legacy }
  end,
  "message_encryptor" => begin
    key = ActiveSupport::KeyGenerator.new("secret_key_base", iterations: 1000).generate_key("salt", 32)
    gcm = ActiveSupport::MessageEncryptor.new(key, serializer: JSON, cipher: "aes-256-gcm")
    cbc = ActiveSupport::MessageEncryptor.new(key, serializer: JSON, cipher: "aes-256-cbc")
    { "key_hex" => key.unpack1("H*"), "message" => gcm.encrypt_and_sign({ "data" => [1, 2, 3] }),
      "purpose" => gcm.encrypt_and_sign("secret", purpose: "shipping"),
      "cbc_message" => cbc.encrypt_and_sign({ "data" => [1, 2, 3] }),
      "cbc_purpose" => cbc.encrypt_and_sign("secret", purpose: "shipping"),
      "url_safe" => ActiveSupport::MessageEncryptor.new(key, serializer: JSON, cipher: "aes-256-gcm", url_safe: true)
        .encrypt_and_sign({ "data" => "x" * 40 }),
      "url_safe_verifier" => ActiveSupport::MessageVerifier.new("secret", serializer: JSON, url_safe: true).generate("??>>??") }
  end,
  "key_generator" => {
    "sha1_64" => ActiveSupport::KeyGenerator.new("secret", iterations: 1000).generate_key("salt").unpack1("H*"),
    "sha256_32" => ActiveSupport::KeyGenerator.new("secret", iterations: 1000, hash_digest_class: OpenSSL::Digest::SHA256).generate_key("salt", 32).unpack1("H*"),
  },
  "digest" => { "hello" => ActiveSupport::Digest.hexdigest("hello") },
  "time_zone" => [
    ["Eastern Time (US & Canada)", [2024, 3, 10, 1, 30]],   # just before spring-forward
    ["Eastern Time (US & Canada)", [2024, 3, 10, 2, 30]],   # inside the gap
    ["Eastern Time (US & Canada)", [2024, 11, 3, 1, 30]],   # ambiguous fall-back hour
    ["Pacific Time (US & Canada)", [2024, 1, 31, 23, 59]],
    ["London", [2024, 3, 31, 0, 30]],
    ["Kathmandu", [2024, 6, 15, 12, 0]],
    ["Sydney", [2024, 4, 7, 2, 30]],
    ["UTC", [2024, 2, 29, 12, 0]],
  ].map do |zone, args|
    t = ActiveSupport::TimeZone[zone].local(*args)
    { "zone" => zone, "args" => args, "to_s" => t.to_s, "xmlschema" => t.xmlschema(3),
      "plus_1_day" => (t + 1.day).to_s, "plus_24_hours" => (t + 24.hours).to_s,
      "plus_1_month" => (t + 1.month).to_s, "minus_1_hour" => (t - 1.hour).to_s,
      "beginning_of_week" => t.beginning_of_week.to_s, "end_of_month" => t.end_of_month.to_s,
      "beginning_of_day" => t.beginning_of_day.to_s, "end_of_quarter" => t.end_of_quarter.to_s,
      "strftime" => t.strftime("%a %d %b %Y %H:%M:%S %z %:z %j %U %W %p %I %-m/%-d"),
      "db" => t.to_fs(:db), "long_ordinal" => t.to_fs(:long_ordinal), "utc_offset" => t.utc_offset,
      "zone_formatted" => ActiveSupport::TimeZone[zone].to_s }
  end,
  "time_zone_parse" => [
    ["Eastern Time (US & Canada)", "2024-07-04 12:00"],
    ["Eastern Time (US & Canada)", "2024-07-04T12:00:00Z"],
    ["Tokyo", "2024-01-01T00:00:00+05:30"],
    ["Tokyo", "2024-12-31 23:59:59.5"],
  ].map { |zone, str| { "zone" => zone, "input" => str, "to_s" => ActiveSupport::TimeZone[zone].parse(str).to_s } },
}

path = File.expand_path("../test/fixtures/rails_parity.json", __dir__)
File.write(path, JSON.pretty_generate(fixture) + "\n")
puts "wrote #{path} (ActiveSupport #{ActiveSupport::VERSION::STRING})"
