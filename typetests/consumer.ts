// Compile-only checks that the published declarations are usable from
// TypeScript (`npm run typecheck`). Nothing here runs.
import {
  pluralize, camelize, parameterize, isBlank, presence, toSentence, pluck, sole, deepMerge,
  days, hours, Duration, Time, TimeZone, TimeWithZone, numberToCurrency, numberToHuman,
  Callbacks, abort, Notifications, Cache, CurrentAttributes, MessageVerifier, MessageEncryptor,
  KeyGenerator, ErrorReporter, Logger, TaggedLogging, ParameterFilter, htmlSafe, SafeBuffer,
  DateExt, StringExt, HashExt,
} from "activejs";
import { MemoryStore } from "activejs/cache";
import { travelTo, freezeTime } from "activejs/testing";

const s1: string = pluralize("person");
const s2: string = camelize("active_model", false);
const s3: string = parameterize("Hello World", { separator: "_" });
// @ts-expect-error unknown option
parameterize("x", { seperator: "_" });
const b: boolean = isBlank(null);
const maybe: string | undefined = presence("x");
const sentence: string = toSentence(["a", "b"]);
const names: string[] = pluck([{ name: "a" }], "name");
const one: number = sole([1]);
const merged = deepMerge({ a: 1 }, { b: 2 });

const d: Duration = days(1).plus(hours(2));
const seconds: number = d.inSeconds();
const when: Date = days(2).since(new Date());
const twz: TimeWithZone = days(1).since(TimeZone.find("Tokyo")!.now());
const iso: string = Duration.parse("P1D").iso8601();
const begin: Date = DateExt.beginningOfMonth(new Date());
const formatted: string = DateExt.strftime(new Date(), "%Y");
const squished: string = StringExt.squish("  a  ");
const sliced = HashExt.slice({ a: 1, b: 2 }, "a");

Time.zone = "Eastern Time (US & Canada)";
const local: TimeWithZone = TimeZone.find("UTC")!.local(2024, 1, 31);
const hour: number = local.hour;
const tzString: string = local.plus(hours(1)).toString();

const money: string = numberToCurrency(1234.5, { unit: "€" });
const human: string = numberToHuman(1234567);

class Record extends Callbacks() {
  static {
    this.defineCallbacks("save");
    this.setCallback("save", "before", (r: Record) => { if (!r) abort(); });
  }
  save(): unknown {
    return this.runCallbacks("save", () => true);
  }
}
new Record().save();

const sub = Notifications.subscribe("sql", (event) => event.duration);
Notifications.instrument("sql", { sql: "SELECT 1" }, () => 1);
Notifications.unsubscribe(sub);

const cache = new MemoryStore({ namespace: "app" });
const fetched: number = cache.fetch("k", () => 1);
const asyncFetched: Promise<string> = cache.fetch("k2", async () => "x");
const store2: InstanceType<typeof Cache.NullStore> = new Cache.NullStore();

class Current extends CurrentAttributes {
  static { this.attribute("user"); }
}
CurrentAttributes.wrap(() => Current.reset());

const verifier = new MessageVerifier("secret", { digest: "SHA256" });
const token: string = verifier.generate({ id: 1 }, { purpose: "login", expiresIn: hours(1) });
verifier.verified(token, { purpose: "login" });
const key = new KeyGenerator("base", { iterations: 1000 }).generateKey("salt", 32);
new MessageEncryptor(key).encryptAndSign("x");

const reporter = new ErrorReporter();
reporter.subscribe({ report(error, { handled, severity }) { void [error, handled, severity]; } });
const fallback = reporter.handle(() => 1);

const logger = TaggedLogging.new(new Logger(process.stdout));
logger.tagged("req", () => logger.info("hi"));
logger.info("plain");

const filtered = new ParameterFilter(["password"]).filter({ password: "x" });
const safe: SafeBuffer = htmlSafe("<b>").concat("<i>");

travelTo(new Date(2020, 0, 1), () => {});
freezeTime(() => {});

void [s1, s2, s3, b, maybe, sentence, names, one, merged, seconds, when, twz, iso, begin, formatted, squished,
  sliced, hour, tzString, money, human, fetched, asyncFetched, store2, token, fallback, filtered, safe];
