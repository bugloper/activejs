// Port of ActiveSupport::BacktraceCleaner.
//
//   const bc = new BacktraceCleaner()
//   bc.addFilter((line) => line.replace(process.cwd(), ""))
//   bc.addSilencer((line) => /node_modules/.test(line))
//   bc.clean(error.stack)  // accepts a stack string or an array of lines
//
// Filters transform lines; silencers drop lines. kind: "silent" (default),
// "noise" (only the silenced lines), or "all" (filters only).
/** @typedef {"silent" | "noise" | "all"} BacktraceKind */
/** @typedef {string | string[] | Error} Backtrace */

export class BacktraceCleaner {
  constructor() {
    /** @type {((line: string) => string)[]} */
    this.filters = [];
    /** @type {((line: string) => boolean)[]} */
    this.silencers = [];
    this.addDefaultFiltersAndSilencers();
  }

  /** @returns {void} */
  addDefaultFiltersAndSilencers() {
    const root = `${process.cwd()}/`;
    this.addFilter((line) => (line.includes(root) ? line.split(root).join("") : line));
    this.addSilencer((line) => /node:internal|\(node:|node_modules\//.test(line));
  }

  /**
   * @param {(line: string) => string} fn
   * @returns {void}
   */
  addFilter(fn) { this.filters.push(fn); }
  /**
   * @param {(line: string) => boolean} fn
   * @returns {void}
   */
  addSilencer(fn) { this.silencers.push(fn); }
  /** @returns {void} */
  removeSilencers() { this.silencers = []; }
  /** @returns {void} */
  removeFilters() { this.filters = []; }

  /**
   * @param {Backtrace} backtrace
   * @param {BacktraceKind} [kind]
   * @returns {string[]}
   */
  clean(backtrace, kind = "silent") {
    const lines = toLines(backtrace);
    const filtered = lines.map((line) => this.filters.reduce((l, f) => f(l), line));
    switch (kind) {
      case "silent": return filtered.filter((l) => !this.silencers.some((s) => s(l)));
      case "noise": return filtered.filter((l) => this.silencers.some((s) => s(l)));
      default: return filtered;
    }
  }
  /**
   * @param {Backtrace} backtrace
   * @param {BacktraceKind} [kind]
   * @returns {string[]}
   */
  filter(backtrace, kind) { return this.clean(backtrace, kind); }

  /**
   * Returns the first line that survives cleaning.
   * @param {string} frame
   * @param {BacktraceKind} [kind]
   * @returns {string | undefined}
   */
  cleanFrame(frame, kind = "silent") {
    return this.clean([frame], kind)[0];
  }

  /**
   * @param {BacktraceKind} [kind]
   * @returns {string | undefined}
   */
  firstCleanFrame(kind = "silent") {
    return this.clean(new Error().stack, kind).find((l) => !l.includes("backtrace_cleaner.js"));
  }
}

/**
 * @param {Backtrace} backtrace
 * @returns {string[]}
 */
function toLines(backtrace) {
  if (Array.isArray(backtrace)) return backtrace;
  if (backtrace instanceof Error) return toLines(backtrace.stack ?? "");
  return String(backtrace)
    .split("\n")
    .filter((l) => /^\s*at /.test(l))
    .map((l) => l.trim());
}
