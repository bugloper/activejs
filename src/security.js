// Ports of ActiveSupport::KeyGenerator, MessageVerifier, MessageEncryptor,
// SecurityUtils and the SecureRandom extensions.
//
// Message formats match Rails when Rails is configured with the JSON
// serializer: verifier messages are "base64(json)--hexHMAC", encrypted
// messages are "base64(ciphertext)--base64(iv)--base64(authTag)" with
// aes-256-gcm, and purpose/expiry live in a {"_rails": {...}} envelope.
import crypto from "node:crypto";

/**
 * Anything whose valueOf() is a number of seconds, such as a Duration.
 * @typedef {number | { valueOf(): number }} Seconds
 */

/**
 * Purpose and expiry metadata embedded in a message.
 * @typedef {object} MessageMetadata
 * @property {unknown} [purpose]
 * @property {Date | string | number} [expiresAt]
 * @property {Seconds} [expiresIn]
 */

/**
 * @typedef {object} Serializer
 * @property {(value: unknown) => string} dump
 * @property {(string: string) => unknown} load
 */

// ---- SecurityUtils ------------------------------------------------------------

/**
 * Constant-time comparison of two strings of equal length.
 * @param {unknown} a
 * @param {unknown} b
 * @returns {boolean}
 */
export function fixedLengthSecureCompare(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) throw new TypeError("string length mismatch.");
  return crypto.timingSafeEqual(ba, bb);
}

/**
 * Constant-time comparison that also hides the length difference.
 * @param {unknown} a
 * @param {unknown} b
 * @returns {boolean}
 */
export function secureCompare(a, b) {
  const ha = crypto.createHash("sha256").update(String(a)).digest();
  const hb = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb) && String(a) === String(b);
}

// ---- SecureRandom ---------------------------------------------------------------

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const BASE36_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";
const ALPHANUMERIC = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/**
 * @param {string} alphabet
 * @param {number} n
 * @returns {string}
 */
function randomFrom(alphabet, n) {
  let out = "";
  // Rejection sampling keeps the distribution uniform.
  const max = 256 - (256 % alphabet.length);
  while (out.length < n) {
    for (const byte of crypto.randomBytes(n * 2)) {
      if (byte < max) out += alphabet[byte % alphabet.length];
      if (out.length === n) break;
    }
  }
  return out;
}

export const SecureRandom = {
  /** @type {(n?: number) => string} */
  hex: (n = 16) => crypto.randomBytes(n).toString("hex"),
  /** @type {(n?: number) => string} */
  base64: (n = 16) => crypto.randomBytes(n).toString("base64"),
  /** @type {(n?: number, padding?: boolean) => string} */
  urlsafeBase64: (n = 16, padding = false) => {
    const s = crypto.randomBytes(n).toString("base64url");
    return padding ? s.padEnd(Math.ceil(s.length / 4) * 4, "=") : s;
  },
  /** @type {(n?: number) => Buffer} */
  randomBytes: (n = 16) => crypto.randomBytes(n),
  /** @type {() => string} */
  uuid: () => crypto.randomUUID(),
  /** @type {(n?: number) => string} */
  base58: (n = 16) => randomFrom(BASE58_ALPHABET, n),
  /** @type {(n?: number) => string} */
  base36: (n = 16) => randomFrom(BASE36_ALPHABET, n),
  /** @type {(n?: number, options?: { chars?: string }) => string} */
  alphanumeric: (n = 16, { chars = ALPHANUMERIC } = {}) => randomFrom(chars, n),
  /** @type {(max?: number) => number} */
  randomNumber: (max) => (max === undefined ? crypto.randomInt(0, 2 ** 48) / 2 ** 48 : crypto.randomInt(0, max)),
};

// ---- KeyGenerator -------------------------------------------------------------

/**
 * Derives keys from a secret with PBKDF2, like Rails' KeyGenerator.
 *   const keyGen = new KeyGenerator(secretKeyBase, { iterations: 1000, hashDigestClass: "sha256" })
 *   keyGen.generateKey("encrypted cookie", 32)
 */
export class KeyGenerator {
  /**
   * @param {string | Buffer} secret
   * @param {{ iterations?: number, hashDigestClass?: string }} [options]
   */
  constructor(secret, { iterations = 2 ** 16, hashDigestClass = "sha1" } = {}) {
    this.secret = secret;
    this.iterations = iterations;
    this.hashDigestClass = normalizeDigest(hashDigestClass);
  }

  /**
   * @param {string | Buffer} salt
   * @param {number} [keySize]
   * @returns {Buffer}
   */
  generateKey(salt, keySize = 64) {
    return crypto.pbkdf2Sync(this.secret, salt, this.iterations, keySize, this.hashDigestClass);
  }
}

/** Memoizes derived keys, since PBKDF2 is deliberately slow. */
export class CachingKeyGenerator {
  /** @param {{ generateKey(salt: string | Buffer, keySize?: number): Buffer }} keyGenerator */
  constructor(keyGenerator) {
    this.keyGenerator = keyGenerator;
    /** @type {Map<string, Buffer>} */
    this.cache = new Map();
  }

  /**
   * @param {string | Buffer} salt
   * @param {number} [keySize]
   * @returns {Buffer}
   */
  generateKey(salt, keySize = 64) {
    const k = `${salt}|${keySize}`;
    if (!this.cache.has(k)) this.cache.set(k, this.keyGenerator.generateKey(salt, keySize));
    return this.cache.get(k);
  }
}

/** @param {unknown} d */
const normalizeDigest = (d) => String(d).toLowerCase().replace(/^sha-?/, "sha");

// ---- Messages -------------------------------------------------------------------

export class InvalidSignature extends Error {
  /** @param {string} [message] */
  constructor(message = "InvalidSignature") {
    super(message);
    this.name = "InvalidSignature";
  }
}

export class InvalidMessage extends Error {
  /** @param {string} [message] */
  constructor(message = "InvalidMessage") {
    super(message);
    this.name = "InvalidMessage";
  }
}

/** @type {Serializer} */
export const JSONSerializer = {
  dump: (value) => JSON.stringify(value),
  load: (string) => JSON.parse(string),
};

/**
 * @param {MessageMetadata} options
 * @returns {string | undefined}
 */
function expiryFor({ expiresAt, expiresIn }) {
  let at;
  if (expiresAt !== undefined && expiresAt !== null) at = new Date(expiresAt);
  else if (expiresIn !== undefined && expiresIn !== null) at = new Date(Date.now() + Number(expiresIn.valueOf()) * 1000);
  return at ? at.toISOString() : undefined; // ISO 8601 with milliseconds, UTC, like iso8601(3)
}

// Rails has two metadata envelopes. Apps on load_defaults 7.1+ use
//   {"_rails":{"data":<value>,"exp":"...","pur":"..."}}
// while the legacy format (standalone ActiveSupport's default) nests the
// serialized value as base64 and always includes exp/pur:
//   {"_rails":{"message":"<base64 json>","exp":null,"pur":"..."}}
/**
 * @param {unknown} value
 * @param {MessageMetadata} options
 * @param {Serializer} serializer
 * @param {boolean} useMessageSerializerForMetadata
 * @returns {unknown}
 */
function wrapMetadata(value, options, serializer, useMessageSerializerForMetadata) {
  const exp = expiryFor(options);
  const pur = options.purpose === undefined || options.purpose === null ? undefined : String(options.purpose);
  if (exp === undefined && pur === undefined) return value;
  if (!useMessageSerializerForMetadata) {
    const message = Buffer.from(serializer.dump(value)).toString("base64");
    return { _rails: { message, exp: exp ?? null, pur: pur ?? null } };
  }
  /** @type {{ data: unknown, exp?: string, pur?: string }} */
  const rails = { data: value };
  if (exp !== undefined) rails.exp = exp;
  if (pur !== undefined) rails.pur = pur;
  return { _rails: rails };
}

// Returns { ok, value } so callers can tell a valid falsy payload from failure.
// Reads both envelope formats.
/**
 * @param {any} parsed
 * @param {unknown} purpose
 * @param {Serializer} serializer
 * @returns {{ ok: boolean, value?: unknown }}
 */
function unwrapMetadata(parsed, purpose, serializer) {
  const isEnvelope = parsed && typeof parsed === "object" && !Array.isArray(parsed) &&
    Object.keys(parsed).length === 1 && parsed._rails && typeof parsed._rails === "object" &&
    ("data" in parsed._rails || "message" in parsed._rails);
  if (!isEnvelope) {
    return { ok: purpose === undefined || purpose === null, value: parsed };
  }
  const { exp, pur } = parsed._rails;
  const expected = purpose === undefined || purpose === null ? undefined : String(purpose);
  if ((pur ?? undefined) !== expected) return { ok: false };
  if (exp !== undefined && exp !== null && Date.parse(exp) <= Date.now()) return { ok: false };
  if ("data" in parsed._rails) return { ok: true, value: parsed._rails.data };
  try {
    return { ok: true, value: serializer.load(Buffer.from(parsed._rails.message, "base64").toString("utf8")) };
  } catch {
    return { ok: false };
  }
}

/**
 * @param {Buffer | string} buf
 * @param {boolean} urlSafe
 */
const b64encode = (buf, urlSafe) => Buffer.from(buf).toString(urlSafe ? "base64url" : "base64");
/**
 * @param {string} str
 * @param {boolean} urlSafe
 */
const b64decode = (str, urlSafe) => {
  const valid = urlSafe ? /^[A-Za-z0-9_-]*={0,2}$/ : /^[A-Za-z0-9+/]*={0,2}$/;
  if (!valid.test(str)) throw new InvalidMessage();
  return Buffer.from(str, urlSafe ? "base64url" : "base64");
};

/**
 * Generates and verifies signed (not encrypted) messages.
 *   const verifier = new MessageVerifier("secret", { digest: "SHA256" })
 *   const token = verifier.generate({ userId: 1 }, { purpose: "login", expiresIn: hours(1) })
 *   verifier.verified(token, { purpose: "login" }) // => { userId: 1 }
 *   verifier.verify(tampered)                       // throws InvalidSignature
 */
export class MessageVerifier {
  /**
   * @param {string | Buffer} secret
   * @param {{ digest?: string, serializer?: Serializer, urlSafe?: boolean, useMessageSerializerForMetadata?: boolean }} [options]
   */
  constructor(secret, { digest = "SHA1", serializer = JSONSerializer, urlSafe = false, useMessageSerializerForMetadata = true } = {}) {
    if (secret === undefined || secret === null || secret === "") throw new TypeError("Secret should not be nil.");
    this.secret = secret;
    this.digest = normalizeDigest(digest);
    this.serializer = serializer;
    this.urlSafe = urlSafe;
    this.useMessageSerializerForMetadata = useMessageSerializerForMetadata;
  }

  /**
   * @param {unknown} value
   * @param {MessageMetadata} [options]
   * @returns {string}
   */
  generate(value, options = {}) {
    const wrapped = wrapMetadata(value, options, this.serializer, this.useMessageSerializerForMetadata);
    const data = b64encode(this.serializer.dump(wrapped), this.urlSafe);
    return `${data}--${this.#digestFor(data)}`;
  }

  /**
   * Returns true if the message is correctly signed (ignores purpose/expiry).
   * @param {unknown} message
   * @returns {boolean}
   */
  isValidMessage(message) {
    const parts = this.#split(message);
    return Boolean(parts) && secureCompare(parts[1], this.#digestFor(parts[0]));
  }

  /**
   * Returns the decoded value, or undefined if the signature is invalid, the
   * purpose doesn't match, or the message has expired.
   * @param {unknown} message
   * @param {{ purpose?: unknown }} [options]
   * @returns {unknown}
   */
  verified(message, { purpose } = {}) {
    const result = this.#verify(message, purpose);
    return result.ok ? result.value : undefined;
  }

  /**
   * Like verified, but throws InvalidSignature instead of returning undefined.
   * @param {unknown} message
   * @param {{ purpose?: unknown }} [options]
   * @returns {unknown}
   */
  verify(message, { purpose } = {}) {
    const result = this.#verify(message, purpose);
    if (!result.ok) throw new InvalidSignature();
    return result.value;
  }

  /**
   * @param {unknown} message
   * @param {unknown} purpose
   * @returns {{ ok: boolean, value?: unknown }}
   */
  #verify(message, purpose) {
    if (!this.isValidMessage(message)) return { ok: false };
    const [data] = this.#split(message);
    let parsed;
    try {
      parsed = this.serializer.load(b64decode(data, this.urlSafe).toString("utf8"));
    } catch {
      return { ok: false };
    }
    return unwrapMetadata(parsed, purpose, this.serializer);
  }

  /**
   * @param {unknown} message
   * @returns {[string, string] | undefined}
   */
  #split(message) {
    if (typeof message !== "string" || message === "") return undefined;
    const i = message.lastIndexOf("--");
    if (i <= 0) return undefined;
    return [message.slice(0, i), message.slice(i + 2)];
  }

  /** @param {string} data */
  #digestFor(data) {
    return crypto.createHmac(this.digest, this.secret).update(data).digest("hex");
  }
}

/**
 * Encrypts and authenticates messages.
 *   const key = new KeyGenerator(secretKeyBase).generateKey("salt", MessageEncryptor.keyLen())
 *   const crypt = new MessageEncryptor(key)
 *   const box = crypt.encryptAndSign("my secret data", { expiresIn: days(1) })
 *   crypt.decryptAndVerify(box) // => "my secret data"
 *
 * The default cipher is aes-256-gcm, what Rails apps use (load_defaults 5.2+).
 * For messages from standalone ActiveSupport or older apps, pass
 * { cipher: "aes-256-cbc" }: the ciphertext is then signed with an HMAC
 * (digest "SHA1" and the encryption secret by default, or signSecret).
 */
export class MessageEncryptor {
  static defaultCipher = "aes-256-gcm";

  /**
   * @param {string} [cipher]
   * @returns {number}
   */
  static keyLen(cipher = MessageEncryptor.defaultCipher) {
    return crypto.getCipherInfo(cipher).keyLength;
  }

  /**
   * @param {string | Buffer} secret
   * @param {{ cipher?: string, serializer?: Serializer, urlSafe?: boolean,
   *   useMessageSerializerForMetadata?: boolean, signSecret?: string | Buffer, digest?: string }} [options]
   */
  constructor(secret, {
    cipher = MessageEncryptor.defaultCipher, serializer = JSONSerializer, urlSafe = false,
    useMessageSerializerForMetadata = true, signSecret, digest = "SHA1",
  } = {}) {
    this.secret = Buffer.isBuffer(secret) ? secret : Buffer.from(secret);
    this.cipher = cipher.toLowerCase();
    this.serializer = serializer;
    this.urlSafe = urlSafe;
    this.useMessageSerializerForMetadata = useMessageSerializerForMetadata;
    this.aead = /gcm$/.test(this.cipher);
    const info = crypto.getCipherInfo(this.cipher);
    if (!info) throw new TypeError(`unsupported cipher: ${cipher}`);
    if (this.secret.length !== info.keyLength) {
      throw new TypeError(`key must be ${info.keyLength} bytes for ${cipher}, got ${this.secret.length}`);
    }
    this.ivLength = info.ivLength ?? 16;
    /** @type {MessageVerifier | undefined} */
    this.verifier = undefined;
    if (!this.aead) {
      // Signs "base64(ciphertext)--base64(iv)" like Rails' inner MessageVerifier.
      this.verifier = new MessageVerifier(signSecret ?? this.secret, {
        digest, serializer: { dump: (s) => /** @type {string} */ (s), load: (s) => s }, urlSafe,
      });
    }
  }

  /**
   * @param {unknown} value
   * @param {MessageMetadata} [options]
   * @returns {string}
   */
  encryptAndSign(value, options = {}) {
    const iv = crypto.randomBytes(this.ivLength);
    // Typed as the GCM variant so getAuthTag is visible; it's only called in AEAD mode.
    const c = /** @type {crypto.CipherGCM} */ (crypto.createCipheriv(this.cipher, this.secret, iv));
    const plaintext = this.serializer.dump(
      wrapMetadata(value, options, this.serializer, this.useMessageSerializerForMetadata),
    );
    const encrypted = Buffer.concat([c.update(plaintext, "utf8"), c.final()]);
    const parts = this.aead ? [encrypted, iv, c.getAuthTag()] : [encrypted, iv];
    const joined = parts.map((b) => b64encode(b, this.urlSafe)).join("--");
    return this.aead ? joined : this.verifier.generate(joined);
  }

  /**
   * Returns the value, or undefined when the purpose doesn't match or the
   * message expired. Throws InvalidMessage if it was tampered with.
   * @param {unknown} message
   * @param {{ purpose?: unknown }} [options]
   * @returns {unknown}
   */
  decryptAndVerify(message, { purpose } = {}) {
    let inner = message;
    if (!this.aead) {
      try {
        inner = this.verifier.verify(message);
      } catch {
        throw new InvalidMessage();
      }
    }
    const parts = this.#extractParts(inner);
    let plaintext;
    try {
      const [encrypted, iv, tag] = parts.map((p) => b64decode(p, this.urlSafe));
      const d = /** @type {crypto.DecipherGCM} */ (crypto.createDecipheriv(this.cipher, this.secret, iv));
      if (this.aead) {
        if (tag.length !== 16) throw new InvalidMessage();
        d.setAuthTag(tag);
      }
      plaintext = Buffer.concat([d.update(encrypted), d.final()]).toString("utf8");
    } catch {
      throw new InvalidMessage();
    }
    let parsed;
    try {
      parsed = this.serializer.load(plaintext);
    } catch {
      throw new InvalidMessage();
    }
    const result = unwrapMetadata(parsed, purpose, this.serializer);
    return result.ok ? result.value : undefined;
  }

  // Slices the auth tag and IV off the end by their known encoded lengths,
  // as Rails does, because url-safe base64 may itself contain "--".
  /**
   * @param {unknown} message
   * @returns {string[]}
   */
  #extractParts(message) {
    if (typeof message !== "string") throw new InvalidMessage();
    /** @param {number} bytes */
    const encodedLength = (bytes) => b64encode(Buffer.alloc(bytes), this.urlSafe).length;
    const parts = [];
    let end = message.length;
    for (const bytes of this.aead ? [16, this.ivLength] : [this.ivLength]) {
      const length = encodedLength(bytes);
      const start = end - length;
      if (start < 2 || message.slice(start - 2, start) !== "--") throw new InvalidMessage();
      parts.unshift(message.slice(start, end));
      end = start - 2;
    }
    parts.unshift(message.slice(0, end));
    return parts;
  }
}

// ---- Digest ---------------------------------------------------------------------

// Digest.hexdigest("hello") // => first 32 hex chars of the digest, matching
// ActiveSupport::Digest (used for cache keys and ETags, not security).
// ActiveSupport defaults to MD5; Rails apps on load_defaults 7.0+ switch to
// SHA-256 — set Digest.hashDigestClass = "sha256" to match those.
export const Digest = {
  hashDigestClass: "md5",
  /**
   * @param {unknown} data
   * @returns {string}
   */
  hexdigest(data) {
    return crypto.createHash(this.hashDigestClass).update(String(data)).digest("hex").slice(0, 32);
  },
};
