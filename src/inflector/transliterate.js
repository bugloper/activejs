// Port of ActiveSupport::Inflector#transliterate and #parameterize.
//
// Rails relies on I18n's approximation table; here Unicode NFD decomposition
// strips accents and a small table covers letters that don't decompose.

/** @type {Record<string, string>} */
const APPROXIMATIONS = {
  "Æ": "AE", "æ": "ae", "Ð": "D", "ð": "d", "Ø": "O", "ø": "o", "Þ": "Th", "þ": "th",
  "ß": "ss", "Œ": "OE", "œ": "oe", "Ł": "L", "ł": "l", "Đ": "D", "đ": "d", "Ħ": "H",
  "ħ": "h", "ı": "i", "Ŀ": "L", "ŀ": "l", "Ŋ": "N", "ŋ": "n", "Ŧ": "T", "ŧ": "t",
  "ĸ": "k", "ſ": "s", "Ə": "E", "ə": "e",
  "‘": "'", "’": "'", "‚": ",", "“": '"', "”": '"', "„": '"', "–": "-", "—": "-",
  "…": "...", "\u00a0": " ",
};

/** @type {Record<string, Record<string, string>>} */
const LOCALE_APPROXIMATIONS = {
  de: { "Ä": "AE", "ä": "ae", "Ö": "OE", "ö": "oe", "Ü": "UE", "ü": "ue" },
  da: { "Å": "AA", "å": "aa" },
};

/**
 * @param {string} string
 * @param {string} [replacement]
 * @param {{ locale?: string }} [options]
 * @returns {string}
 */
export function transliterate(string, replacement = "?", { locale } = {}) {
  if (typeof string !== "string") {
    throw new TypeError("Can only transliterate strings");
  }
  const localeMap = (locale && LOCALE_APPROXIMATIONS[locale]) || {};
  let out = "";
  for (const char of string) {
    if (localeMap[char] !== undefined) {
      out += localeMap[char];
      continue;
    }
    if (APPROXIMATIONS[char] !== undefined) {
      out += APPROXIMATIONS[char];
      continue;
    }
    const stripped = char.normalize("NFD").replace(/\p{M}/gu, "");
    out += /^[\x00-\x7F]*$/.test(stripped) ? stripped : replacement;
  }
  return out;
}

/** @param {unknown} s */
const escapeRegExp = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * @param {string} string
 * @param {{ separator?: string, preserveCase?: boolean, locale?: string }} [options]
 * @returns {string}
 */
export function parameterize(string, { separator = "-", preserveCase = false, locale } = {}) {
  let result = transliterate(string, "?", { locale }).replace(/[^a-z0-9\-_]+/gi, separator);

  if (separator) {
    const sep = escapeRegExp(separator);
    result = result
      .replace(new RegExp(`(?:${sep}){2,}`, "g"), separator)
      .replace(new RegExp(`^${sep}|${sep}$`, "gi"), "");
  }
  return preserveCase ? result : result.toLowerCase();
}
