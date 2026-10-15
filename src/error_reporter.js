// Port of ActiveSupport::ErrorReporter (Rails.error).
//
//   const reporter = new ErrorReporter()
//   reporter.subscribe({ report(error, { handled, severity, context, source }) { ... } })
//   reporter.handle(() => riskyThing())                       // swallows + reports
//   reporter.handle(TypeError, { fallback: () => 0 }, () => parse(x))
//   reporter.record(() => mustSucceed())                      // reports + rethrows
//   reporter.setContext({ requestId })                        // per async context
import { AsyncLocalStorage } from "node:async_hooks";

/** @typedef {"error" | "warning" | "info"} Severity */

/**
 * @typedef {object} ReportOptions
 * @property {boolean} handled
 * @property {Severity} severity
 * @property {Record<string, unknown>} context
 * @property {string} source
 */

/**
 * @typedef {object} ErrorSubscriber
 * @property {(error: unknown, options: ReportOptions) => void} report
 */

/** @typedef {new (...args: any[]) => Error} ErrorClass */

const SEVERITIES = ["error", "warning", "info"];
const DEFAULT_SOURCE = "application";

export class ErrorReporter {
  /** @param {...ErrorSubscriber} subscribers */
  constructor(...subscribers) {
    this.subscribers = subscribers;
    this.debugMode = false;
    /** @type {{ error?: (message: string) => void } | null | undefined} */
    this.logger = console;
    /** @type {AsyncLocalStorage<Record<string, unknown>>} */
    this.contextStorage = new AsyncLocalStorage();
    /** @type {Record<string, unknown>} */
    this.globalContext = {};
    /** @type {Set<unknown>} */
    this.disabled = new Set();
  }

  /**
   * @param {ErrorSubscriber} subscriber
   * @returns {void}
   */
  subscribe(subscriber) {
    if (typeof subscriber?.report !== "function") {
      throw new TypeError("Error subscribers must respond to report(error, options)");
    }
    this.subscribers.push(subscriber);
  }

  /**
   * Removes a subscriber instance, or every subscriber of the given class.
   * @param {ErrorSubscriber | Function} subscriber
   * @returns {void}
   */
  unsubscribe(subscriber) {
    this.subscribers = this.subscribers.filter((s) => s !== subscriber && s.constructor !== subscriber);
  }

  /**
   * Prevents a subscriber from being notified while fn runs.
   * @template T
   * @param {ErrorSubscriber | Function} subscriber
   * @param {() => T} fn
   * @returns {T}
   */
  disable(subscriber, fn) {
    this.disabled.add(subscriber);
    try {
      return fn();
    } finally {
      this.disabled.delete(subscriber);
    }
  }

  /** @returns {Record<string, unknown>} */
  get context() {
    return { ...this.globalContext, ...(this.contextStorage.getStore() ?? {}) };
  }

  /**
   * @param {Record<string, unknown>} ctx
   * @returns {void}
   */
  setContext(ctx) {
    const store = this.contextStorage.getStore();
    Object.assign(store ?? this.globalContext, ctx);
  }

  /**
   * Runs fn with a fresh context scope that later setContext calls fill.
   * @template T
   * @param {Record<string, unknown>} ctx
   * @param {() => T} fn
   * @returns {T}
   */
  withContext(ctx, fn) {
    return this.contextStorage.run({ ...(this.contextStorage.getStore() ?? {}), ...ctx }, fn);
  }

  /** @returns {void} */
  clearContext() {
    const store = this.contextStorage.getStore();
    for (const k of Object.keys(store ?? this.globalContext)) delete (store ?? this.globalContext)[k];
  }

  /**
   * handle(ErrorClass..., { severity, context, fallback, source }, fn)
   * @param {...(ErrorClass | { severity?: Severity, context?: Record<string, unknown>, fallback?: unknown, source?: string } | (() => unknown))} args
   * @returns {any}
   */
  handle(...args) {
    const { classes, options, fn } = parseArgs(args);
    const { severity = "warning", context = {}, fallback, source = DEFAULT_SOURCE } = options;
    /** @param {unknown} error */
    const onError = (error) => {
      if (!matchesAny(classes, error)) throw error;
      this.report(error, { handled: true, severity, context, source });
      return typeof fallback === "function" ? fallback() : fallback;
    };
    try {
      const result = /** @type {any} */ (fn());
      if (result && typeof result.then === "function") return result.catch(onError);
      return result;
    } catch (error) {
      return onError(error);
    }
  }

  /**
   * record(ErrorClass..., { severity, context, source }, fn) — reports, then rethrows.
   * @param {...(ErrorClass | { severity?: Severity, context?: Record<string, unknown>, source?: string } | (() => unknown))} args
   * @returns {any}
   */
  record(...args) {
    const { classes, options, fn } = parseArgs(args);
    const { severity = "error", context = {}, source = DEFAULT_SOURCE } = options;
    /** @param {unknown} error */
    const onError = (error) => {
      if (matchesAny(classes, error)) this.report(error, { handled: false, severity, context, source });
      throw error;
    };
    try {
      const result = /** @type {any} */ (fn());
      if (result && typeof result.then === "function") return result.catch(onError);
      return result;
    } catch (error) {
      return onError(error);
    }
  }

  /**
   * Reports an error that should never happen: throws in debug mode,
   * reports it as handled otherwise.
   * @param {unknown} error
   * @param {{ severity?: Severity, context?: Record<string, unknown>, source?: string }} [options]
   * @returns {void}
   */
  unexpected(error, { severity = "warning", context = {}, source = DEFAULT_SOURCE } = {}) {
    const err = typeof error === "string" ? new UnexpectedError(error) : error;
    if (this.debugMode) throw err;
    this.report(err, { handled: true, severity, context, source });
  }

  /**
   * @param {unknown} error
   * @param {Partial<ReportOptions>} [options]
   * @returns {void}
   */
  report(error, { handled = true, severity = handled ? "warning" : "error", context = {}, source = DEFAULT_SOURCE } = {}) {
    if (!SEVERITIES.includes(severity)) {
      throw new TypeError(`severity must be one of ${SEVERITIES.join(", ")}, got: ${severity}`);
    }
    if (error && /** @type {any} */ (error).__activejsReported) return;
    const fullContext = { ...this.context, ...context };
    for (const subscriber of this.subscribers) {
      if (this.disabled.has(subscriber) || this.disabled.has(subscriber.constructor)) continue;
      try {
        subscriber.report(error, { handled, severity, context: fullContext, source });
      } catch (subscriberError) {
        if (this.debugMode) throw subscriberError;
        this.logger?.error?.(`Error subscriber raised an error: ${subscriberError.message} (${subscriberError.constructor.name})`);
      }
    }
    if (error && typeof error === "object") {
      Object.defineProperty(error, "__activejsReported", { value: true, enumerable: false, configurable: true });
    }
  }
}

export class UnexpectedError extends Error {
  /** @param {string} [message] */
  constructor(message) {
    super(message);
    this.name = "UnexpectedError";
  }
}

/**
 * @param {unknown[]} args
 * @returns {{ classes: ErrorClass[], options: any, fn: () => unknown }}
 */
function parseArgs(args) {
  const fn = args.pop();
  if (typeof fn !== "function") throw new TypeError("Missing block");
  const last = args.at(-1);
  const options = last && typeof last === "object" && typeof last !== "function" ? args.pop() : {};
  return {
    classes: /** @type {ErrorClass[]} */ (args.length ? args : [Error]),
    options,
    fn: /** @type {() => unknown} */ (fn),
  };
}

/**
 * @param {ErrorClass[]} classes
 * @param {unknown} error
 */
const matchesAny = (classes, error) => classes.some((c) => error instanceof c);
