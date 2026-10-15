// Port of ActiveSupport::Inflector::Inflections.
//
// Rules are stored newest-first, exactly like Rails: a rule added later takes
// precedence over the defaults. Ruby back-references ("\\1") in replacement
// strings are accepted (as are JS-style "$1" references).

/** @typedef {(substring: string, ...args: any[]) => string} ReplaceFn */
/** @typedef {string | ReplaceFn} Replacement */
/** @typedef {[RegExp, ReplaceFn]} Rule */
/** @typedef {"all" | "plurals" | "singulars" | "uncountables" | "humans" | "acronyms"} ClearScope */

/** @param {unknown} s */
const escapeRegExp = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Ruby-style "\\1" back-references become a replacer function, so references
// to groups that don't exist or didn't participate yield "" as in Ruby
// (a JS "$1" string would be left in literally).
/**
 * @param {Replacement} replacement
 * @returns {ReplaceFn}
 */
const toJsReplacement = (replacement) => {
  if (typeof replacement !== "string") return replacement;
  const normalized = replacement.replace(/\$(\d)/g, "\\$1");
  return (...args) => {
    const groups = args.slice(1, args.findIndex((a) => typeof a === "number"));
    return normalized.replace(/\\(\d)/g, (_, n) => groups[Number(n) - 1] ?? "");
  };
};

/** @param {string | RegExp} rule */
const toRule = (rule) =>
  rule instanceof RegExp ? rule : new RegExp(escapeRegExp(rule), "i");

class Uncountables {
  constructor() {
    /** @type {Set<string>} */
    this.words = new Set();
    /** @type {Map<string, RegExp>} */
    this.regexes = new Map();
  }

  /** @param {unknown[]} words */
  add(words) {
    for (const word of words.flat()) {
      const w = String(word).toLowerCase();
      this.words.add(w);
      this.regexes.set(w, new RegExp(`\\b${escapeRegExp(w)}$`, "i"));
    }
  }

  /** @param {unknown} word */
  delete(word) {
    const w = String(word).toLowerCase();
    this.words.delete(w);
    this.regexes.delete(w);
  }

  /**
   * @param {string} str
   * @returns {boolean}
   */
  has(str) {
    for (const re of this.regexes.values()) if (re.test(str)) return true;
    return false;
  }

  clear() {
    this.words.clear();
    this.regexes.clear();
  }

  /** @returns {string[]} */
  toArray() {
    return [...this.words];
  }
}

export class Inflections {
  /** @type {Map<string, Inflections>} */
  static #instances = new Map();

  /**
   * @param {string} [locale]
   * @returns {Inflections}
   */
  static instance(locale = "en") {
    if (!this.#instances.has(locale)) this.#instances.set(locale, new Inflections());
    return this.#instances.get(locale);
  }

  /**
   * @param {string} [locale]
   * @returns {Inflections}
   */
  static instanceOrFallback(locale = "en") {
    return this.#instances.get(locale) ?? this.instance("en");
  }

  constructor() {
    /** @type {Rule[]} */
    this.plurals = [];
    /** @type {Rule[]} */
    this.singulars = [];
    this.uncountables = new Uncountables();
    /** @type {Rule[]} */
    this.humans = [];
    /** @type {Record<string, string>} */
    this.acronyms = {};
    /** @type {string} */
    this.acronymRegexSource = "";
    /** @type {RegExp} */
    this.acronymsCamelizeRegex = /(?:)/;
    /** @type {RegExp} */
    this.acronymsUnderscoreRegex = /(?:)/g;
    this.#defineAcronymRegex();
  }

  /**
   * Specifies a new acronym. An acronym must be specified as it will appear
   * in a camelized string: acronym("HTML"), acronym("API").
   * @param {string} word
   * @returns {void}
   */
  acronym(word) {
    this.acronyms[word.toLowerCase()] = word;
    this.#defineAcronymRegex();
  }

  /**
   * @param {string | RegExp} rule
   * @param {string} replacement
   * @returns {void}
   */
  plural(rule, replacement) {
    if (typeof rule === "string") this.uncountables.delete(rule);
    this.uncountables.delete(replacement);
    this.plurals.unshift([toRule(rule), toJsReplacement(replacement)]);
  }

  /**
   * @param {string | RegExp} rule
   * @param {string} replacement
   * @returns {void}
   */
  singular(rule, replacement) {
    if (typeof rule === "string") this.uncountables.delete(rule);
    this.uncountables.delete(replacement);
    this.singulars.unshift([toRule(rule), toJsReplacement(replacement)]);
  }

  /**
   * @param {string} singular
   * @param {string} plural
   * @returns {void}
   */
  irregular(singular, plural) {
    this.uncountables.delete(singular);
    this.uncountables.delete(plural);

    const s0 = singular[0];
    const srest = escapeRegExp(singular.slice(1));
    const p0 = plural[0];
    const prest = escapeRegExp(plural.slice(1));
    const rawSrest = singular.slice(1);
    const rawPrest = plural.slice(1);

    if (s0.toUpperCase() === p0.toUpperCase()) {
      this.plural(new RegExp(`(${escapeRegExp(s0)})${srest}$`, "i"), `$1${rawPrest}`);
      this.plural(new RegExp(`(${escapeRegExp(p0)})${prest}$`, "i"), `$1${rawPrest}`);
      this.singular(new RegExp(`(${escapeRegExp(s0)})${srest}$`, "i"), `$1${rawSrest}`);
      this.singular(new RegExp(`(${escapeRegExp(p0)})${prest}$`, "i"), `$1${rawSrest}`);
    } else {
      // Ruby uses /S(?i)rest$/ to keep the first letter case-sensitive; JS has
      // no inline flags, so the rest is made caseless by hand and each case of
      // the first letter gets its own rule.
      /** @param {string} rest */
      const caseless = (rest) =>
        rest.replace(/[a-z]/gi, (c) => `[${c.toLowerCase()}${c.toUpperCase()}]`);
      /**
       * @param {string} first
       * @param {string} rest
       * @param {boolean} upper
       */
      const caseRule = (first, rest, upper) =>
        new RegExp(`${upper ? first.toUpperCase() : first.toLowerCase()}${caseless(rest)}$`);
      this.plural(caseRule(s0, srest, true), p0.toUpperCase() + rawPrest);
      this.plural(caseRule(s0, srest, false), p0.toLowerCase() + rawPrest);
      this.plural(caseRule(p0, prest, true), p0.toUpperCase() + rawPrest);
      this.plural(caseRule(p0, prest, false), p0.toLowerCase() + rawPrest);
      this.singular(caseRule(s0, srest, true), s0.toUpperCase() + rawSrest);
      this.singular(caseRule(s0, srest, false), s0.toLowerCase() + rawSrest);
      this.singular(caseRule(p0, prest, true), s0.toUpperCase() + rawSrest);
      this.singular(caseRule(p0, prest, false), s0.toLowerCase() + rawSrest);
    }
  }

  /**
   * @param {...(string | string[])} words
   * @returns {void}
   */
  uncountable(...words) {
    this.uncountables.add(words);
  }

  /**
   * Specifies a humanized form of a string by a regular expression rule or by
   * a string mapping: human(/_cnt$/i, "\\1_count"), human("legacy_col_person_name", "Name").
   * @param {string | RegExp} rule
   * @param {string} replacement
   * @returns {void}
   */
  human(rule, replacement) {
    this.humans.unshift([toRule(rule), toJsReplacement(replacement)]);
  }

  /**
   * Clears the loaded inflections within a given scope (default is "all").
   * Give the scope as "plurals", "singulars", "uncountables", "humans" or "acronyms".
   * @param {ClearScope} [scope]
   * @returns {void}
   */
  clear(scope = "all") {
    switch (scope) {
      case "all":
        this.plurals = [];
        this.singulars = [];
        this.uncountables.clear();
        this.humans = [];
        this.acronyms = {};
        this.#defineAcronymRegex();
        break;
      case "uncountables":
        this.uncountables.clear();
        break;
      case "acronyms":
        this.acronyms = {};
        this.#defineAcronymRegex();
        break;
      default:
        this[scope] = [];
    }
  }

  #defineAcronymRegex() {
    const values = Object.values(this.acronyms);
    this.acronymRegexSource = values.length ? values.map(escapeRegExp).join("|") : "(?=a)b";
    this.acronymsCamelizeRegex = new RegExp(
      `^(?:(?:${this.acronymRegexSource})(?=\\b|[A-Z_])|\\w)`,
    );
    this.acronymsUnderscoreRegex = new RegExp(
      `(?:(?<=([A-Za-z\\d]))|\\b)(${this.acronymRegexSource})(?=\\b|[^a-z])`,
      "g",
    );
  }
}

// Mirrors activesupport/lib/active_support/inflections.rb
const en = Inflections.instance("en");

en.plural(/$/, "s");
en.plural(/s$/i, "s");
en.plural(/^(ax|test)is$/i, "\\1es");
en.plural(/(octop|vir)us$/i, "\\1i");
en.plural(/(octop|vir)i$/i, "\\1i");
en.plural(/(alias|status)$/i, "\\1es");
en.plural(/(bu)s$/i, "\\1ses");
en.plural(/(buffal|tomat)o$/i, "\\1oes");
en.plural(/([ti])um$/i, "\\1a");
en.plural(/([ti])a$/i, "\\1a");
en.plural(/sis$/i, "ses");
en.plural(/(?:([^f])fe|([lr])f)$/i, "\\1\\2ves");
en.plural(/(hive)$/i, "\\1s");
en.plural(/([^aeiouy]|qu)y$/i, "\\1ies");
en.plural(/(x|ch|ss|sh)$/i, "\\1es");
en.plural(/(matr|vert|ind)(?:ix|ex)$/i, "\\1ices");
en.plural(/^(m|l)ouse$/i, "\\1ice");
en.plural(/^(m|l)ice$/i, "\\1ice");
en.plural(/^(ox)$/i, "\\1en");
en.plural(/^(oxen)$/i, "\\1");
en.plural(/(quiz)$/i, "\\1zes");

en.singular(/s$/i, "");
en.singular(/(ss)$/i, "\\1");
en.singular(/(n)ews$/i, "\\1ews");
en.singular(/([ti])a$/i, "\\1um");
en.singular(/((a)naly|(b)a|(d)iagno|(p)arenthe|(p)rogno|(s)ynop|(t)he)(sis|ses)$/i, "\\1sis");
en.singular(/(^analy)(sis|ses)$/i, "\\1sis");
en.singular(/([^f])ves$/i, "\\1fe");
en.singular(/(hive)s$/i, "\\1");
en.singular(/(tive)s$/i, "\\1");
en.singular(/([lr])ves$/i, "\\1f");
en.singular(/([^aeiouy]|qu)ies$/i, "\\1y");
en.singular(/(s)eries$/i, "\\1eries");
en.singular(/(m)ovies$/i, "\\1ovie");
en.singular(/(x|ch|ss|sh)es$/i, "\\1");
en.singular(/^(m|l)ice$/i, "\\1ouse");
en.singular(/(bus)(es)?$/i, "\\1");
en.singular(/(o)es$/i, "\\1");
en.singular(/(shoe)s$/i, "\\1");
en.singular(/(cris|test)(is|es)$/i, "\\1is");
en.singular(/^(a)x[ie]s$/i, "\\1xis");
en.singular(/(octop|vir)(us|i)$/i, "\\1us");
en.singular(/(alias|status)(es)?$/i, "\\1");
en.singular(/^(ox)en/i, "\\1");
en.singular(/(vert|ind)ices$/i, "\\1ex");
en.singular(/(matr)ices$/i, "\\1ix");
en.singular(/(quiz)zes$/i, "\\1");
en.singular(/(database)s$/i, "\\1");

en.irregular("person", "people");
en.irregular("man", "men");
en.irregular("child", "children");
en.irregular("sex", "sexes");
en.irregular("move", "moves");
en.irregular("zombie", "zombies");

en.uncountable("equipment", "information", "rice", "money", "species", "series", "fish", "sheep", "jeans", "police");

/**
 * Yields the singleton for the locale so rules can be added in a block, like
 * ActiveSupport::Inflector.inflections(:en) { |inflect| ... }.
 * @overload
 * @param {(inflect: Inflections) => void} fn
 * @returns {Inflections}
 */
/**
 * @overload
 * @param {string} [locale]
 * @param {(inflect: Inflections) => void} [fn]
 * @returns {Inflections}
 */
/**
 * @param {string | ((inflect: Inflections) => void)} [locale]
 * @param {(inflect: Inflections) => void} [fn]
 * @returns {Inflections}
 */
export function inflections(locale = "en", fn) {
  if (typeof locale === "function") [fn, locale] = [locale, "en"];
  const instance = Inflections.instance(locale);
  if (fn) fn(instance);
  return instance;
}
