// Port of ActiveSupport::Inflector (methods.rb).
import { Inflections } from "./inflections.js";

/** @param {string} s */
const capitalize = (s) => (s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : s);

/**
 * @param {unknown} word
 * @param {import("./inflections.js").Rule[]} rules
 * @param {string} locale
 * @returns {string}
 */
function applyInflections(word, rules, locale) {
  const result = String(word);
  if (result === "" || Inflections.instanceOrFallback(locale).uncountables.has(result)) {
    return result;
  }
  for (const [rule, replacement] of rules) {
    if (rule.test(result)) {
      rule.lastIndex = 0;
      return result.replace(rule, replacement);
    }
  }
  return result;
}

/**
 * pluralize("post") // => "posts"
 * pluralize("octopus") // => "octopi"
 * @param {unknown} word
 * @param {string} [locale]
 * @returns {string}
 */
export function pluralize(word, locale = "en") {
  return applyInflections(word, Inflections.instanceOrFallback(locale).plurals, locale);
}

/**
 * singularize("posts") // => "post"
 * @param {unknown} word
 * @param {string} [locale]
 * @returns {string}
 */
export function singularize(word, locale = "en") {
  return applyInflections(word, Inflections.instanceOrFallback(locale).singulars, locale);
}

/**
 * camelize("active_model/errors") // => "ActiveModel::Errors"
 * camelize("active_model", false) // => "activeModel"
 * @param {unknown} term
 * @param {boolean | "lower" | "upper"} [uppercaseFirstLetter]
 * @returns {string}
 */
export function camelize(term, uppercaseFirstLetter = true) {
  const inflections = Inflections.instance("en");
  let string = String(term);
  if (!uppercaseFirstLetter || uppercaseFirstLetter === "lower") {
    string = string.replace(inflections.acronymsCamelizeRegex, (m) => m.toLowerCase());
  } else {
    string = string.replace(/^[a-z\d]*/, (m) => inflections.acronyms[m] || capitalize(m));
  }
  return string.replace(/(?:_|(\/))([a-z\d]*)/gi, (_, slash, word) => {
    const substituted = inflections.acronyms[word] || capitalize(word);
    return slash ? `::${substituted}` : substituted;
  });
}

/**
 * underscore("ActiveModel::Errors") // => "active_model/errors"
 * @param {unknown} camelCasedWord
 * @returns {string}
 */
export function underscore(camelCasedWord) {
  const inflections = Inflections.instance("en");
  const input = String(camelCasedWord);
  if (!/[A-Z-]|::/.test(input)) return input;
  return input
    .replace(/::/g, "/")
    .replace(inflections.acronymsUnderscoreRegex, (_, before, acronym) =>
      `${before ? "_" : ""}${acronym.toLowerCase()}`,
    )
    .replace(/(?<=[A-Z])(?=[A-Z][a-z])|(?<=[a-z\d])(?=[A-Z])/g, "_")
    .replace(/-/g, "_")
    .toLowerCase();
}

/**
 * humanize("employee_salary") // => "Employee salary"
 * humanize("author_id") // => "Author"
 * @param {unknown} word
 * @param {{ capitalize?: boolean, keepIdSuffix?: boolean }} [options]
 * @returns {string}
 */
export function humanize(word, { capitalize: cap = true, keepIdSuffix = false } = {}) {
  const inflections = Inflections.instance("en");
  const original = word == null ? "" : String(word);
  let result = original;

  for (const [rule, replacement] of inflections.humans) {
    if (rule.test(result)) {
      rule.lastIndex = 0;
      result = result.replace(rule, replacement);
      break;
    }
  }

  result = result.replace(/_/g, " ").replace(/^\s+/, "");
  if (!keepIdSuffix && original.endsWith("_id")) result = result.replace(/ id$/, "");
  result = result.replace(/[a-z\d]+/gi, (m) => inflections.acronyms[m.toLowerCase()] || m.toLowerCase());
  if (cap) result = result.replace(/^\w/, (m) => m.toUpperCase());
  return result;
}

/**
 * upcaseFirst("what a Lovely Day") // => "What a Lovely Day"
 * @param {unknown} string
 * @returns {string}
 */
export function upcaseFirst(string) {
  const s = String(string);
  return s.length ? s[0].toUpperCase() + s.slice(1) : "";
}

/**
 * downcaseFirst("If they enjoyed The Matrix") // => "if they enjoyed The Matrix"
 * @param {unknown} string
 * @returns {string}
 */
export function downcaseFirst(string) {
  const s = String(string);
  return s.length ? s[0].toLowerCase() + s.slice(1) : "";
}

/**
 * titleize("man from the boondocks") // => "Man From The Boondocks"
 * @param {unknown} word
 * @param {{ keepIdSuffix?: boolean }} [options]
 * @returns {string}
 */
export function titleize(word, { keepIdSuffix = false } = {}) {
  return humanize(underscore(word), { keepIdSuffix }).replace(
    /\b(?<!\w['’`()])[a-z]/g,
    (m) => m.toUpperCase(),
  );
}

/**
 * tableize("RawScaledScorer") // => "raw_scaled_scorers"
 * @param {unknown} className
 * @returns {string}
 */
export function tableize(className) {
  return pluralize(underscore(className));
}

/**
 * classify("ham_and_eggs") // => "HamAndEgg"
 * classify("schema.posts") // => "Post"
 * @param {unknown} tableName
 * @returns {string}
 */
export function classify(tableName) {
  return camelize(singularize(String(tableName).replace(/.*\./, "")));
}

/**
 * dasherize("puni_puni") // => "puni-puni"
 * @param {unknown} underscoredWord
 * @returns {string}
 */
export function dasherize(underscoredWord) {
  return String(underscoredWord).replace(/_/g, "-");
}

/**
 * demodulize("ActiveSupport::Inflector::Inflections") // => "Inflections"
 * @param {unknown} path
 * @returns {string}
 */
export function demodulize(path) {
  const s = String(path);
  const i = s.lastIndexOf("::");
  return i === -1 ? s : s.slice(i + 2);
}

/**
 * deconstantize("Net::HTTP::Get") // => "Net::HTTP"
 * @param {unknown} path
 * @returns {string}
 */
export function deconstantize(path) {
  const s = String(path);
  const i = s.lastIndexOf("::");
  return i === -1 ? "" : s.slice(0, i);
}

/**
 * foreignKey("Message") // => "message_id"
 * foreignKey("Message", false) // => "messageid"
 * @param {unknown} className
 * @param {boolean} [separateClassNameAndIdWithUnderscore]
 * @returns {string}
 */
export function foreignKey(className, separateClassNameAndIdWithUnderscore = true) {
  return underscore(demodulize(className)) + (separateClassNameAndIdWithUnderscore ? "_id" : "id");
}

/**
 * ordinal(1) // => "st"
 * @param {number | string} number
 * @returns {"st" | "nd" | "rd" | "th"}
 */
export function ordinal(number) {
  const abs = Math.abs(Math.trunc(Number(number)));
  if ([11, 12, 13].includes(abs % 100)) return "th";
  switch (abs % 10) {
    case 1: return "st";
    case 2: return "nd";
    case 3: return "rd";
    default: return "th";
  }
}

/**
 * ordinalize(1002) // => "1002nd"
 * @param {number | string} number
 * @returns {string}
 */
export function ordinalize(number) {
  return `${number}${ordinal(number)}`;
}

/**
 * constantize("Foo::Bar") resolves a "::" or "." separated path starting at
 * globalThis (or the given root object), since JS has no constant table.
 * @param {string} camelCasedWord
 * @param {object} [root]
 * @returns {any}
 */
export function constantize(camelCasedWord, root = globalThis) {
  const names = String(camelCasedWord).split(/::|\./).filter(Boolean);
  let current = root;
  for (const name of names) {
    if (current == null || !(name in Object(current))) {
      throw new ReferenceError(`uninitialized constant ${camelCasedWord}`);
    }
    current = current[name];
  }
  return current;
}

/**
 * @param {string} camelCasedWord
 * @param {object} [root]
 * @returns {any}
 */
export function safeConstantize(camelCasedWord, root = globalThis) {
  try {
    return constantize(camelCasedWord, root);
  } catch (e) {
    if (e instanceof ReferenceError) return undefined;
    throw e;
  }
}
