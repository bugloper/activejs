import { test } from "node:test";
import assert from "node:assert/strict";
import { Callbacks, abort, runCallbacksAsync } from "../src/callbacks.js";
import { concern, include, prepend, includes, mixin } from "../src/concern.js";
import { Notifications } from "../src/notifications.js";
import { MemoryStore, NullStore, lookupStore, expandCacheKey } from "../src/cache.js";
import { CurrentAttributes } from "../src/current_attributes.js";
import { Configurable } from "../src/configurable.js";
import { ArrayInquirer } from "../src/array_inquirer.js";
import { Deprecation } from "../src/deprecation.js";
import { Rescuable } from "../src/rescuable.js";
import { ErrorReporter } from "../src/error_reporter.js";
import { classAttribute, mattrAccessor, delegate, delegateMissingTo, aliasAttribute } from "../src/class_attribute.js";
import { onLoad, runLoadHooks } from "../src/lazy_load_hooks.js";
import { minutes, seconds } from "../src/duration.js";

test("callbacks: ordering, around nesting, halting and conditions", () => {
  const log = [];
  class Record extends Callbacks() {
    static {
      this.defineCallbacks("save");
      this.setCallback("save", "before", "first");
      this.setCallback("save", "around", (r, next) => { log.push("around:in"); next(); log.push("around:out"); });
      this.setCallback("save", "before", "second", { if: "valid", unless: (r) => r.skipSecond });
      this.setCallback("save", "after", "afterA");
      this.setCallback("save", "after", "afterB");
    }
    first() { log.push("first"); }
    second() { log.push("second"); if (this.halt) abort(); }
    afterA() { log.push("afterA"); }
    afterB() { log.push("afterB"); }
    get valid() { return true; }
    save() { return this.runCallbacks("save", () => { log.push("save"); return "saved"; }); }
  }

  assert.equal(new Record().save(), "saved");
  assert.deepEqual(log.splice(0), ["first", "around:in", "second", "save", "afterB", "afterA", "around:out"]);

  const halted = new Record();
  halted.halt = true;
  assert.equal(halted.save(), false);
  assert.deepEqual(log.splice(0), ["first", "around:in", "second", "afterB", "afterA", "around:out"]);

  const skipping = new Record();
  skipping.skipSecond = true;
  skipping.save();
  assert.deepEqual(log.splice(0), ["first", "around:in", "save", "afterB", "afterA", "around:out"]);

  class Child extends Record {
    static {
      this.skipCallback("save", "before", "first");
      this.setCallback("save", "before", "zeroth", { prepend: true });
    }
    zeroth() { log.push("zeroth"); }
  }
  new Child().save();
  assert.deepEqual(log.splice(0), ["zeroth", "around:in", "second", "save", "afterB", "afterA", "around:out"]);
  new Record().save();
  assert.equal(log[0], "first", "skipping in a subclass must not affect the parent");
  log.length = 0;

  assert.throws(() => Child.skipCallback("save", "before", "nope"), /has not been defined/);
  assert.doesNotThrow(() => Child.skipCallback("save", "before", "nope", { raise: false }));
});

test("callbacks: skipAfterCallbacksIfTerminated, custom terminator, callback objects", () => {
  const log = [];
  class Job extends Callbacks() {
    static {
      this.defineCallbacks("perform", { skipAfterCallbacksIfTerminated: true });
      this.setCallback("perform", "before", () => abort());
      this.setCallback("perform", "after", () => log.push("after"));
      this.defineCallbacks("run", { terminator: (target, result) => result() === false });
      this.setCallback("run", "before", () => false);
      this.defineCallbacks("audit");
      this.setCallback("audit", "before", { beforeAudit: (r) => log.push(`audited ${r.constructor.name}`) });
    }
  }
  const job = new Job();
  assert.equal(job.runCallbacks("perform", () => log.push("performed")), false);
  assert.deepEqual(log.splice(0), []);
  assert.equal(job.runCallbacks("run", () => "ran"), false);
  job.runCallbacks("audit");
  assert.deepEqual(log.splice(0), ["audited Job"]);
});

test("callbacks: the sync runner rejects async before callbacks instead of treating them as halts", () => {
  class Job extends Callbacks() {
    static {
      this.defineCallbacks("run", { terminator: async (target, result) => { await result(); return false; } });
      this.setCallback("run", "before", () => {});
    }
  }
  assert.throws(() => new Job().runCallbacks("run", () => 1), /use runCallbacksAsync/);
  class Upload extends Callbacks() {
    static {
      this.defineCallbacks("process");
      this.setCallback("process", "before", async () => {});
    }
  }
  assert.throws(() => new Upload().runCallbacks("process"), /use runCallbacksAsync/);
});

test("callbacks: async runner awaits filters and the block", async () => {
  const log = [];
  class Upload extends Callbacks() {
    static {
      this.defineCallbacks("process");
      this.setCallback("process", "before", async () => { await tick(); log.push("before"); });
      this.setCallback("process", "around", async (r, next) => { log.push("in"); await next(); log.push("out"); });
      this.setCallback("process", "after", async () => { await tick(); log.push("after"); });
    }
  }
  const result = await runCallbacksAsync(new Upload(), "process", async () => { await tick(); log.push("block"); return 42; });
  assert.equal(result, 42);
  assert.deepEqual(log, ["before", "in", "block", "after", "out"]);

  class Halting extends Callbacks() {
    static {
      this.defineCallbacks("process");
      this.setCallback("process", "before", async () => { await tick(); abort(); });
    }
  }
  assert.equal(await new Halting().runCallbacksAsync("process", () => "never"), false);
});

const tick = () => new Promise((r) => setImmediate(r));

test("concern: dependencies, included hook, class and instance methods, prepend", () => {
  const order = [];
  const Trackable = concern({ included(base) { order.push(`Trackable->${base.name}`); }, instanceMethods: { track() { return "tracked"; } } });
  const Visible = concern({
    dependsOn: [Trackable],
    included(base) { order.push(`Visible->${base.name}`); base.visibleByDefault = true; },
    classMethods: { visible(items) { return items.filter((i) => i.visible); } },
    instanceMethods: { hide() { this.visible = false; return this; } },
  });
  class Post {}
  include(Post, Visible, Trackable);
  assert.deepEqual(order, ["Trackable->Post", "Visible->Post"]);
  assert.equal(Post.visibleByDefault, true);
  assert.equal(new Post().hide().visible, false);
  assert.equal(new Post().track(), "tracked");
  assert.deepEqual(Post.visible([{ visible: true }, { visible: false }]), [{ visible: true }]);
  assert.equal(includes(Post, Visible), true);

  class Base { greet() { return "hi"; } }
  const Loud = concern({ instanceMethods: { greet(original) { return original().toUpperCase(); } } });
  prepend(Base, Loud);
  assert.equal(new Base().greet(), "HI");

  class Comment extends mixin(Object, Visible) {}
  assert.equal(new Comment().track(), "tracked");
});

test("notifications: subscribe patterns, five-arg form, subscribed, unsubscribe", async () => {
  const events = [];
  const sub = Notifications.subscribe(/^sql\./, (event) => events.push([event.name, event.payload.sql, typeof event.duration]));
  const legacy = Notifications.subscribe("sql.active_record", (name, start, finish, id, payload) => events.push(["legacy", payload.sql, finish >= start]));
  assert.equal(Notifications.instrument("sql.active_record", { sql: "SELECT 1" }, () => "rows"), "rows");
  Notifications.instrument("cache.read", {}, () => {});
  Notifications.unsubscribe(sub);
  Notifications.unsubscribe(legacy);
  Notifications.instrument("sql.active_record", { sql: "ignored" });
  assert.deepEqual(events, [["sql.active_record", "SELECT 1", "number"], ["legacy", "SELECT 1", true]]);

  const seen = [];
  const value = await Notifications.subscribed((e) => seen.push(e.name), "job.perform", async () => {
    await Notifications.instrument("job.perform", {}, async () => tick());
    return "done";
  });
  assert.equal(value, "done");
  Notifications.instrument("job.perform");
  assert.deepEqual(seen, ["job.perform"]);

  const errors = [];
  Notifications.subscribed((e) => errors.push(e.payload.exception), "boom", () => {
    assert.throws(() => Notifications.instrument("boom", {}, () => { throw new TypeError("bad"); }), TypeError);
  });
  assert.deepEqual(errors, [["TypeError", "bad"]]);

  const evented = [];
  const listener = { start: (name) => evented.push(`start ${name}`), finish: (name) => evented.push(`finish ${name}`) };
  Notifications.subscribe("render", listener);
  Notifications.instrument("render", {}, () => evented.push("rendering"));
  Notifications.unsubscribe(listener);
  assert.deepEqual(evented, ["start render", "rendering", "finish render"]);
});

test("cache: fetch, expiry, versions, namespaces, increments, LRU pruning", async () => {
  const cache = new MemoryStore({ namespace: "app" });
  let calls = 0;
  assert.equal(cache.fetch("k", () => ++calls), 1);
  assert.equal(cache.fetch("k", () => ++calls), 1);
  assert.equal(cache.fetch("k", { force: true }, () => ++calls), 2);
  assert.equal(cache.read("k"), 2);
  assert.equal(cache.exist("k"), true);
  assert.equal(cache.delete("k"), true);
  assert.equal(cache.read("k"), undefined);

  cache.write("short", "x", { expiresIn: seconds(0.01) });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(cache.read("short"), undefined);

  cache.write("versioned", "v1", { version: 1 });
  assert.equal(cache.read("versioned", { version: 1 }), "v1");
  assert.equal(cache.read("versioned", { version: 2 }), undefined);
  const record = { cacheKey: () => "posts/1", cacheVersion: () => "20240101" };
  cache.write(record, "body");
  assert.equal(cache.read(record), "body");
  assert.equal(cache.read({ cacheKey: () => "posts/1", cacheVersion: () => "20240202" }), undefined);

  assert.equal(expandCacheKey(["views", { b: 2, a: 1 }, 3], "ns"), "ns:views/a=1/b=2/3");
  assert.equal(cache.fetch("nil", { skipNil: true }, () => null), null);
  assert.equal(cache.exist("nil"), false);

  assert.equal(cache.increment("hits"), 1);
  assert.equal(cache.increment("hits", 4), 5);
  assert.equal(cache.decrement("hits", 2), 3);
  cache.write("user/1", 1);
  cache.write("user/2", 2);
  assert.equal(cache.deleteMatched(/^user\//), 2);

  const value = { list: [1] };
  cache.write("dup", value);
  value.list.push(2);
  assert.deepEqual(cache.read("dup"), { list: [1] }, "stored values are copied");

  assert.deepEqual(cache.fetchMulti("a", "b", (k) => k.toUpperCase()), { a: "A", b: "B" });
  assert.deepEqual(cache.readMulti("a", "b", "missing"), { a: "A", b: "B" });
  assert.equal(await cache.fetch("async", async () => "later"), "later");
  assert.equal(cache.read("async"), "later");

  const small = new MemoryStore({ size: 200 });
  for (let i = 0; i < 20; i++) small.write(`key${i}`, "x".repeat(20));
  assert.ok(small.cacheSize <= 200);
  assert.equal(small.read("key19"), "x".repeat(20), "most recent entry survives pruning");
  assert.equal(small.read("key0"), undefined, "least recently used entry is pruned");

  const reads = [];
  const sub = Notifications.subscribe("cache_read.active_support", (e) => reads.push(e.payload.hit));
  cache.read("a");
  cache.read("zzz");
  Notifications.unsubscribe(sub);
  assert.deepEqual(reads, [true, false]);

  const nullStore = new NullStore();
  nullStore.write("a", 1);
  assert.equal(nullStore.read("a"), undefined);
  assert.equal(nullStore.fetch("a", () => 2), 2);
  assert.ok(lookupStore("memory_store") instanceof MemoryStore);
  assert.ok(lookupStore("null_store") instanceof NullStore);
  assert.equal(new MemoryStore({ expiresIn: minutes(5) }).options.expiresIn.inSeconds(), 300);
});

test("current attributes: per-context isolation, defaults, set, reset hooks", async () => {
  const resets = [];
  class Current extends CurrentAttributes {
    static {
      this.attribute("user", "account");
      this.attribute("tags", { default: [] });
      this.beforeReset(() => resets.push("before"));
      this.resets(() => resets.push("after"));
    }
  }
  const results = await Promise.all(["a", "b"].map((name, i) => CurrentAttributes.wrap(async () => {
    Current.user = name;
    Current.tags.push(name);
    await new Promise((r) => setTimeout(r, (2 - i) * 5));
    return [Current.user, [...Current.tags]];
  })));
  assert.deepEqual(results, [["a", ["a"]], ["b", ["b"]]]);
  assert.equal(Current.user, undefined);

  Current.user = "outer";
  assert.equal(Current.set({ user: "inner" }, () => Current.user), "inner");
  assert.equal(Current.user, "outer");
  assert.throws(() => Current.set({ nope: 1 }, () => {}), /Unknown attribute/);
  Current.reset();
  assert.equal(Current.user, undefined);
  assert.deepEqual(resets, ["before", "after"]);
  assert.deepEqual(Current.attributeNames, ["user", "account", "tags"]);
});

test("configurable: inheritance and instance overrides", () => {
  class App extends Configurable() {
    static { this.configAccessor("timeout", { default: 5 }); this.configAccessor("secret", { instanceWriter: false }); }
  }
  class Admin extends App {}
  App.configure((c) => { c.secret = "s"; });
  Admin.timeout = 10;
  assert.equal(App.timeout, 5);
  assert.equal(Admin.timeout, 10);
  assert.equal(Admin.secret, "s");
  const app = new App();
  app.timeout = 1;
  assert.equal(app.timeout, 1);
  assert.equal(App.timeout, 5);
  assert.equal(new App().config.secret, "s");
});

test("array inquirer", () => {
  const variants = new ArrayInquirer(["phone", "tablet"]);
  assert.equal(variants.phone(), true);
  assert.equal(variants.desktop(), false);
  assert.equal(variants.any("desktop", "tablet"), true);
  assert.equal(variants.any(), true);
  assert.equal(variants.length, 2);
  assert.deepEqual(variants.map((v) => v.length), [5, 6]);
});

test("deprecation: behaviors, silence, disallowed, deprecateMethods", () => {
  const warnings = [];
  const deprecator = new Deprecation("2.0", "MyGem");
  deprecator.behavior = (message) => warnings.push(message);
  deprecator.warn("old thing");
  assert.match(warnings[0], /^DEPRECATION WARNING: old thing \(called from .*modules\.test\.js/);
  deprecator.silence(() => deprecator.warn("hidden"));
  assert.equal(warnings.length, 1);

  class Api { fetch() { return "data"; } list() { return []; } }
  deprecator.deprecateMethods(Api, "fetch", { list: "all" });
  assert.equal(new Api().fetch(), "data");
  new Api().list();
  assert.match(warnings[1], /fetch is deprecated and will be removed from MyGem 2\.0/);
  assert.match(warnings[2], /list is deprecated .* \(use all instead\)/);

  deprecator.disallowedWarnings = [/dangerous/];
  assert.throws(() => deprecator.warn("dangerous call"), { name: "DeprecationException" });
  deprecator.allow("all", () => deprecator.warn("dangerous but allowed"));
  assert.match(warnings.at(-1), /dangerous but allowed/);
  deprecator.behavior = "raise";
  assert.throws(() => deprecator.warn("x"), { name: "DeprecationException" });
});

test("rescuable: handler lookup by class, name, inheritance and cause", () => {
  class NotAuthorized extends Error {}
  class Invalid extends TypeError {}
  const handled = [];
  class Controller extends Rescuable() {
    static {
      this.rescueFrom(Error, (c, e) => handled.push(`generic ${e.message}`));
      this.rescueFrom(NotAuthorized, "deny");
      this.rescueFrom("TypeError", { with: (c, e) => handled.push(`type ${e.message}`) });
    }
    deny(e) { handled.push(`deny ${e.message}`); }
  }
  class Child extends Controller {
    static { this.rescueFrom(Invalid, (c, e) => handled.push(`child ${e.message}`)); }
  }
  const c = new Child();
  assert.equal(c.rescueWithHandler(new NotAuthorized("a")), true);
  assert.equal(c.rescueWithHandler(new Invalid("b")), true);
  assert.equal(c.rescueWithHandler(new TypeError("c")), true);
  assert.equal(c.rescueWithHandler(new RangeError("d")), true);
  assert.equal(new Controller().rescueWithHandler(new Invalid("e")), true);
  assert.deepEqual(handled, ["deny a", "child b", "type c", "generic d", "type e"]);

  class Strict extends Rescuable() { static { this.rescueFrom(NotAuthorized, () => handled.push("cause")); } }
  assert.equal(new Strict().rescueWithHandler(new Error("wrapper", { cause: new NotAuthorized("x") })), true);
  assert.equal(new Strict().rescueWithHandler(new Error("nothing")), false);
});

test("error reporter: handle, record, context, subscribers", async () => {
  const reports = [];
  const reporter = new ErrorReporter();
  reporter.subscribe({ report: (error, opts) => reports.push([error.message, opts.handled, opts.severity, opts.context]) });
  reporter.setContext({ app: "test" });

  assert.equal(reporter.handle(() => { throw new Error("a"); }), undefined);
  assert.equal(reporter.handle(TypeError, { fallback: () => 0, context: { id: 1 } }, () => { throw new TypeError("b"); }), 0);
  assert.throws(() => reporter.handle(TypeError, () => { throw new RangeError("not handled"); }), RangeError);
  assert.throws(() => reporter.record(() => { throw new Error("c"); }), /c/);
  assert.equal(await reporter.handle(async () => { throw new Error("d"); }), undefined);
  await reporter.withContext({ request: 7 }, async () => {
    await tick();
    reporter.report(new Error("e"));
  });

  assert.deepEqual(reports, [
    ["a", true, "warning", { app: "test" }],
    ["b", true, "warning", { app: "test", id: 1 }],
    ["c", false, "error", { app: "test" }],
    ["d", true, "warning", { app: "test" }],
    ["e", true, "warning", { app: "test", request: 7 }],
  ]);
  reporter.debugMode = true;
  assert.throws(() => reporter.unexpected("should not happen"), /should not happen/);
});

test("class attributes, mattr accessors, delegation", () => {
  class Base {}
  classAttribute(Base, "setting", { default: "base" });
  class Sub extends Base {}
  assert.equal(Sub.setting, "base");
  Sub.setting = "sub";
  assert.equal(Base.setting, "base");
  assert.equal(Sub.setting, "sub");
  assert.equal(Base.isSetting(), true);
  const obj = new Sub();
  assert.equal(obj.setting, "sub");
  obj.setting = "instance";
  assert.equal(new Sub().setting, "sub");

  class Shared {}
  mattrAccessor(Shared, "logger", { default: "stdout" });
  class SharedChild extends Shared {}
  SharedChild.logger = "file";
  assert.equal(Shared.logger, "file", "mattr values are shared across the hierarchy");
  assert.equal(new Shared().logger, "file");

  class Post {
    constructor(author) { this.author = author; }
  }
  delegate(Post, "name", "greet", { to: "author", prefix: true });
  delegate(Post, "email", { to: "author", allowNil: true });
  const post = new Post({ name: "Ada", email: "a@b", greet(x) { return `hi ${x}`; } });
  assert.equal(post.authorName(), "Ada");
  assert.equal(post.authorGreet("there"), "hi there");
  assert.equal(new Post(null).email(), undefined);
  assert.throws(() => new Post(null).authorName(), { name: "DelegationError" });
  assert.throws(() => delegate(Post, "x", { to: function author() { return null; }, prefix: true }), /explicit prefix/);

  class Partition {
    constructor(records) { this.records = records; }
    own() { return "own"; }
  }
  delegateMissingTo(Partition, "records");
  const p = new Partition([3, 1, 2]);
  assert.equal(p.own(), "own");
  assert.equal(p.length, 3);
  assert.deepEqual(p.map((x) => x * 2), [6, 2, 4]);

  class Content { constructor() { this.title = "T"; } }
  aliasAttribute(Content, "subject", "title");
  const c = new Content();
  c.subject = "S";
  assert.equal(c.title, "S");
});

test("lazy load hooks", () => {
  const ran = [];
  onLoad("my_framework", function () { ran.push(["before", this.name]); });
  runLoadHooks("my_framework", { name: "Base" });
  onLoad("my_framework", (base) => ran.push(["after", base.name]), { yield: true });
  assert.deepEqual(ran, [["before", "Base"], ["after", "Base"]]);
});
