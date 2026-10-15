// Ports of ActiveSupport::Logger, TaggedLogging and BroadcastLogger.
//
//   const logger = TaggedLogging.new(new Logger(process.stdout))
//   logger.tagged("BCX", "Jason", () => logger.info("Stuff"))  // "[BCX] [Jason] Stuff"
//   logger.silence("error", () => noisyThing())
//
// Tags are scoped per async context, so concurrent requests don't mix tags.
import { AsyncLocalStorage } from "node:async_hooks";

/** @typedef {"debug" | "info" | "warn" | "error" | "fatal" | "unknown"} SeverityName */
/** @typedef {SeverityName | Uppercase<SeverityName> | number} LogLevel */

/**
 * @typedef {(severity: string, time: Date, progname: string | undefined, msg: string) => string} Formatter
 */

/**
 * Where log lines go: a writable stream, a function, an array to push lines
 * into, or null to discard them.
 * @typedef {{ write(line: string): unknown, end?: () => unknown } | ((line: string) => unknown) | string[] | null} LogDevice
 */

/** A message, or a function that lazily produces one. @typedef {unknown} LogMessage */

/** @type {SeverityName[]} */
export const SEVERITIES = ["debug", "info", "warn", "error", "fatal", "unknown"];
const LABELS = { debug: "DEBUG", info: "INFO", warn: "WARN", error: "ERROR", fatal: "FATAL", unknown: "ANY" };
/**
 * @param {LogLevel | string} level
 * @returns {number}
 */
const levelIndex = (level) => {
  if (typeof level === "number") return level;
  const i = SEVERITIES.indexOf(/** @type {SeverityName} */ (String(level).toLowerCase()));
  if (i === -1) throw new TypeError(`invalid log level: ${level}`);
  return i;
};

/**
 * The default ActiveSupport formatter: just the message and a newline.
 * @type {Formatter}
 */
export const SimpleFormatter = (severity, time, progname, msg) => `${msg}\n`;

export class Logger {
  /**
   * @param {LogDevice} [io]
   * @param {{ level?: LogLevel, formatter?: Formatter, progname?: string }} [options]
   */
  constructor(io = process.stdout, { level = "debug", formatter = SimpleFormatter, progname } = {}) {
    this.io = io;
    this.level = levelIndex(level);
    this.formatter = formatter;
    this.progname = progname;
    /** @type {AsyncLocalStorage<number>} */
    this.localLevel = new AsyncLocalStorage();
  }

  /** @returns {number} */
  get effectiveLevel() {
    return this.localLevel.getStore() ?? this.level;
  }

  /**
   * add(severity, message) / add(severity, () => expensiveMessage)
   * @param {LogLevel} severity
   * @param {LogMessage} message
   * @param {string} [progname]
   * @returns {boolean}
   */
  add(severity, message, progname = this.progname) {
    const sev = levelIndex(severity);
    if (sev < this.effectiveLevel) return true;
    const msg = typeof message === "function" ? message() : message;
    this.write(this.formatter(LABELS[SEVERITIES[sev]], new Date(), progname, formatMessage(msg)));
    return true;
  }

  /**
   * @param {string} line
   * @returns {void}
   */
  write(line) {
    const io = /** @type {any} */ (this.io);
    if (!io) return;
    if (typeof io === "function") io(line);
    else if (typeof io.write === "function") io.write(line);
    else if (Array.isArray(io)) io.push(line);
  }

  /**
   * Temporarily raises the level for this async context.
   * @template T
   * @param {LogLevel | (() => T)} [level]
   * @param {() => T} [fn]
   * @returns {T}
   */
  silence(level = "error", fn) {
    if (typeof level === "function") [level, fn] = ["error", level];
    return this.localLevel.run(levelIndex(level), fn);
  }

  /**
   * @template T
   * @param {LogLevel} level
   * @param {() => T} fn
   * @returns {T}
   */
  logAt(level, fn) {
    return this.localLevel.run(levelIndex(level), fn);
  }

  /** @returns {void} */
  close() {
    const io = /** @type {any} */ (this.io);
    if (io && typeof io.end === "function" && io !== process.stdout && io !== process.stderr) io.end();
  }

  /** @param {LogMessage} message @returns {boolean} */
  debug(message) { return this.add(0, message); }
  /** @param {LogMessage} message @returns {boolean} */
  info(message) { return this.add(1, message); }
  /** @param {LogMessage} message @returns {boolean} */
  warn(message) { return this.add(2, message); }
  /** @param {LogMessage} message @returns {boolean} */
  error(message) { return this.add(3, message); }
  /** @param {LogMessage} message @returns {boolean} */
  fatal(message) { return this.add(4, message); }
  /** @param {LogMessage} message @returns {boolean} */
  unknown(message) { return this.add(5, message); }

  /** @returns {boolean} */
  isDebug() { return this.effectiveLevel <= 0; }
  /** @returns {boolean} */
  isInfo() { return this.effectiveLevel <= 1; }
  /** @returns {boolean} */
  isWarn() { return this.effectiveLevel <= 2; }
  /** @returns {boolean} */
  isError() { return this.effectiveLevel <= 3; }
  /** @returns {boolean} */
  isFatal() { return this.effectiveLevel <= 4; }
  /** @returns {boolean} */
  isUnknown() { return this.effectiveLevel <= 5; }
}

/**
 * @param {unknown} msg
 * @returns {string}
 */
function formatMessage(msg) {
  if (typeof msg === "string") return msg;
  if (msg instanceof Error) return `${msg.message} (${msg.constructor.name})\n${msg.stack ?? ""}`;
  if (msg === null || msg === undefined) return "";
  return typeof msg === "object" ? JSON.stringify(msg) : String(msg);
}

// ---- TaggedLogging --------------------------------------------------------------

/**
 * A Logger extended by TaggedLogging.new.
 * @typedef {Logger & {
 *   tagged: {
 *     <T>(...args: [...tags: unknown[], fn: (logger: TaggedLogger) => T]): T,
 *     (...tags: unknown[]): TaggedLogger,
 *   },
 *   pushTags: (...tags: unknown[]) => string[],
 *   popTags: (count?: number) => string[],
 *   clearTags: () => void,
 *   currentTags: () => string[],
 * }} TaggedLogger
 */

export const TaggedLogging = {
  /**
   * Wraps a logger so messages are prefixed with the current tags.
   * @param {Logger} logger
   * @returns {TaggedLogger}
   */
  new(logger) {
    const tagged = /** @type {TaggedLogger} */ (logger);
    /** @type {AsyncLocalStorage<string[]>} */
    const tagStorage = new AsyncLocalStorage();
    /** @type {string[]} */
    let globalTags = [];
    const currentTags = () => tagStorage.getStore() ?? globalTags;
    const originalFormatter = logger.formatter;
    const tagsText = () => {
      const tags = currentTags();
      return tags.length ? `${tags.map((t) => `[${t}]`).join(" ")} ` : "";
    };

    logger.formatter = (severity, time, progname, msg) => originalFormatter(severity, time, progname, `${tagsText()}${msg}`);

    // tagged("a", "b", fn) runs fn with extra tags; tagged("a") without fn
    // returns a logger copy that always uses those tags.
    tagged.tagged = /** @type {TaggedLogger["tagged"]} */ (function (...args) {
      const fn = typeof args.at(-1) === "function" ? args.pop() : undefined;
      const newTags = args.flat().filter((t) => t !== null && t !== undefined && String(t) !== "").map(String);
      if (fn) return tagStorage.run([...currentTags(), ...newTags], () => fn(logger));
      const child = Object.create(logger);
      child.add = (severity, message, progname) =>
        tagStorage.run([...currentTags(), ...newTags], () => logger.add(severity, message, progname));
      for (const [i, name] of SEVERITIES.entries()) child[name] = (message) => child.add(i, message);
      return child;
    });
    tagged.pushTags = (...tags) => {
      const flat = tags.flat().filter(Boolean).map(String);
      const store = tagStorage.getStore();
      if (store) store.push(...flat);
      else globalTags = [...globalTags, ...flat];
      return flat;
    };
    tagged.popTags = (count = 1) => {
      const store = tagStorage.getStore();
      if (store) return store.splice(-count, count);
      const popped = globalTags.slice(-count);
      globalTags = globalTags.slice(0, -count);
      return popped;
    };
    tagged.clearTags = () => {
      const store = tagStorage.getStore();
      if (store) store.length = 0;
      else globalTags = [];
    };
    tagged.currentTags = currentTags;
    return tagged;
  },
};

// ---- BroadcastLogger -------------------------------------------------------------

/**
 * Sends every log call to several loggers.
 *   const logger = new BroadcastLogger(stdoutLogger, fileLogger)
 */
export class BroadcastLogger {
  /** @param {...Logger} loggers */
  constructor(...loggers) {
    this.broadcasts = loggers;
  }

  /**
   * @param {...Logger} loggers
   * @returns {void}
   */
  broadcastTo(...loggers) { this.broadcasts.push(...loggers); }
  /**
   * @param {Logger} logger
   * @returns {void}
   */
  stopBroadcastingTo(logger) { this.broadcasts = this.broadcasts.filter((l) => l !== logger); }

  /**
   * @param {LogLevel} severity
   * @param {LogMessage} message
   * @param {string} [progname]
   * @returns {boolean}
   */
  add(severity, message, progname) {
    const msg = typeof message === "function" ? message() : message;
    for (const l of this.broadcasts) l.add(severity, msg, progname);
    return true;
  }

  /** @returns {number} */
  get level() { return Math.min(...this.broadcasts.map((l) => l.level)); }
  /** @param {LogLevel} level */
  set level(level) { for (const l of this.broadcasts) l.level = levelIndex(level); }

  /**
   * @template T
   * @param {LogLevel | (() => T)} level
   * @param {() => T} [fn]
   * @returns {T}
   */
  silence(level, fn) {
    if (typeof level === "function") [level, fn] = ["error", level];
    /** @param {number} i @returns {T} */
    const run = (i) => (i === this.broadcasts.length ? fn() : this.broadcasts[i].silence(/** @type {LogLevel} */ (level), () => run(i + 1)));
    return run(0);
  }

  /** @returns {void} */
  close() { for (const l of this.broadcasts) l.close?.(); }

  /** @param {LogMessage} message @returns {boolean} */
  debug(message) { return this.add(0, message); }
  /** @param {LogMessage} message @returns {boolean} */
  info(message) { return this.add(1, message); }
  /** @param {LogMessage} message @returns {boolean} */
  warn(message) { return this.add(2, message); }
  /** @param {LogMessage} message @returns {boolean} */
  error(message) { return this.add(3, message); }
  /** @param {LogMessage} message @returns {boolean} */
  fatal(message) { return this.add(4, message); }
  /** @param {LogMessage} message @returns {boolean} */
  unknown(message) { return this.add(5, message); }
}
