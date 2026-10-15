// Port of ActiveSupport::Deprecation.
//
//   const deprecator = new Deprecation("2.0", "MyLibrary")
//   deprecator.warn("oldMethod is deprecated, use newMethod instead")
//   // => "DEPRECATION WARNING: oldMethod is deprecated ... (called from ...)"
//   deprecator.behavior = "raise"   // "stderr" | "log" | "notify" | "silence" | "raise" | fn
//   deprecator.deprecateMethods(Klass, "oldMethod", { other: "newMethod" })
import { Notifications } from "./notifications.js";

/**
 * A deprecation behavior: receives the full message, the call stack lines and
 * the deprecator.
 * @typedef {(message: string, callstack: string[], deprecator: Deprecation) => void} DeprecationBehavior
 */

/**
 * Built-in behavior names, or a custom behavior function (or a list of either).
 * @typedef {"raise" | "stderr" | "log" | "notify" | "silence" | "report" | DeprecationBehavior} BehaviorSpec
 */

/** @typedef {string | RegExp} DisallowedRule */

export class DeprecationException extends Error {
  /** @param {string} [message] */
  constructor(message) {
    super(message);
    this.name = "DeprecationException";
  }
}

/** @type {Record<string, DeprecationBehavior>} */
const BEHAVIORS = {
  raise: (message) => { throw new DeprecationException(message); },
  stderr: (message, callstack) => { process.stderr.write(`${message}\n${debugTrace(callstack)}`); },
  log: (message, callstack) => { console.warn(message + (debugTrace(callstack) ? `\n${debugTrace(callstack)}` : "")); },
  notify: (message, callstack, deprecator) => {
    Notifications.instrument(`deprecation.${deprecator.gemName.replace(/\s+/g, "_")}`, {
      message, callstack, gemName: deprecator.gemName, deprecationHorizon: deprecator.deprecationHorizon,
    });
  },
  silence: () => {},
  report: () => {},
};

let debugEnabled = false;
/** @param {string[]} callstack */
const debugTrace = (callstack) => (debugEnabled ? `${callstack.join("\n  ")}\n` : "");

/** @returns {string[]} */
function callerLocation() {
  const stack = new Error().stack?.split("\n").slice(1) ?? [];
  const external = stack.filter((l) => !l.includes("deprecation.js") && !l.includes("node:internal"));
  return external;
}

export class Deprecation {
  /** @param {unknown} v */
  static set debug(v) { debugEnabled = Boolean(v); }
  /** @returns {boolean} */
  static get debug() { return debugEnabled; }

  /**
   * @param {string} [deprecationHorizon]
   * @param {string} [gemName]
   */
  constructor(deprecationHorizon = "next release", gemName = "Rails") {
    this.deprecationHorizon = deprecationHorizon;
    this.gemName = gemName;
    this.silenced = false;
    /** @type {DisallowedRule[] | "all"} */
    this.disallowedWarnings = [];
    this.#behavior = [BEHAVIORS.stderr];
    this.#disallowedBehavior = [BEHAVIORS.raise];
    this.#silencedDepth = 0;
  }

  /** @type {DeprecationBehavior[]} */
  #behavior;
  /** @type {DeprecationBehavior[]} */
  #disallowedBehavior;
  /** @type {number} */
  #silencedDepth;

  /** @returns {DeprecationBehavior[]} */
  get behavior() { return this.#behavior; }
  /** @param {BehaviorSpec | BehaviorSpec[]} b */
  set behavior(b) { this.#behavior = toBehaviors(b); }
  /** @returns {DeprecationBehavior[]} */
  get disallowedBehavior() { return this.#disallowedBehavior; }
  /** @param {BehaviorSpec | BehaviorSpec[]} b */
  set disallowedBehavior(b) { this.#disallowedBehavior = toBehaviors(b); }

  /**
   * @param {string} [message]
   * @param {string[]} [callstack]
   * @returns {void}
   */
  warn(message = "", callstack = callerLocation()) {
    if (this.silenced || this.#silencedDepth > 0) return;
    const full = this.#deprecationMessage(callstack, message);
    const disallowed = this.#isDisallowed(message);
    const behaviors = disallowed ? this.#disallowedBehavior : this.#behavior;
    for (const behavior of behaviors) behavior(full, callstack, this);
  }

  /**
   * Silences warnings for the duration of fn (supports async fn).
   * @template T
   * @param {() => T} fn
   * @returns {T}
   */
  silence(fn) {
    this.#silencedDepth++;
    let result;
    try {
      result = fn();
    } catch (e) {
      this.#silencedDepth--;
      throw e;
    }
    if (result && typeof (/** @type {any} */ (result)).then === "function") {
      return /** @type {any} */ (result).finally(() => this.#silencedDepth--);
    }
    this.#silencedDepth--;
    return result;
  }

  /**
   * Temporarily allows otherwise-disallowed warnings.
   * @template T
   * @param {"all" | DisallowedRule | DisallowedRule[]} allowed
   * @param {() => T} fn
   * @returns {T}
   */
  allow(allowed = "all", fn) {
    const previous = this.disallowedWarnings;
    this.disallowedWarnings = allowed === "all" ? [] : toArray(previous).filter((w) => !toArray(allowed).includes(w));
    try {
      return fn();
    } finally {
      this.disallowedWarnings = previous;
    }
  }

  /**
   * Wraps methods on klass.prototype so calling them warns first.
   *   deprecateMethods(Klass, "a", "b", { c: "useThisInstead", d: "custom message" })
   * @param {Function} klass
   * @param {...(string | Record<string, string | true>)} methods
   * @returns {void}
   */
  deprecateMethods(klass, ...methods) {
    const options = typeof methods.at(-1) === "object" ? methods.pop() : {};
    /** @type {[string, string | true | undefined][]} */
    const entries = [
      ...methods.map((m) => /** @type {[string, undefined]} */ ([String(m), undefined])),
      ...Object.entries(options),
    ];
    for (const [name, replacement] of entries) {
      const original = klass.prototype[name];
      if (typeof original !== "function") throw new TypeError(`${klass.name}#${name} is not a method`);
      const deprecator = this;
      const message = deprecatedMethodWarning(name, replacement, this);
      Object.defineProperty(klass.prototype, name, {
        /** @param {...unknown} args */
        value: function (...args) {
          deprecator.warn(message);
          return original.apply(this, args);
        },
        writable: true, configurable: true,
      });
    }
  }

  /**
   * @param {string[]} callstack
   * @param {string} message
   */
  #deprecationMessage(callstack, message) {
    const location = callstack.find((l) => l.trim().startsWith("at "))?.trim().replace(/^at /, "");
    const base = `DEPRECATION WARNING: ${message || `You are using deprecated behavior which will be removed from the next major or minor release.`}`;
    return location ? `${base} (called from ${location})` : base;
  }

  /** @param {string} message */
  #isDisallowed(message) {
    if (this.disallowedWarnings === "all") return true;
    return toArray(this.disallowedWarnings).some((rule) =>
      String(rule) === "all" ? true : rule instanceof RegExp ? rule.test(message) : message.includes(rule),
    );
  }
}

/**
 * @template T
 * @param {T | T[]} v
 * @returns {T[]}
 */
const toArray = (v) => (Array.isArray(v) ? v : [v]);

/**
 * @param {BehaviorSpec | BehaviorSpec[]} b
 * @returns {DeprecationBehavior[]}
 */
function toBehaviors(b) {
  return toArray(b).map((x) => {
    if (typeof x === "function") return x;
    const fn = BEHAVIORS[x];
    if (!fn) throw new TypeError(`Unknown deprecation behavior: ${x}. Use one of ${Object.keys(BEHAVIORS).join(", ")}`);
    return fn;
  });
}

/**
 * @param {string} name
 * @param {string | true | undefined} replacement
 * @param {Deprecation} deprecator
 */
function deprecatedMethodWarning(name, replacement, deprecator) {
  const horizon = `${name} is deprecated and will be removed from ${deprecator.gemName} ${deprecator.deprecationHorizon}`;
  if (replacement === undefined || replacement === true) return horizon;
  return /\s/.test(replacement) ? `${horizon} (${replacement})` : `${horizon} (use ${replacement} instead)`;
}
