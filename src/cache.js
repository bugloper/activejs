// Port of ActiveSupport::Cache with MemoryStore and NullStore.
//
//   const cache = new MemoryStore({ expiresIn: minutes(5), namespace: "app" })
//   cache.fetch(["user", user.id], () => expensiveLookup())
//   cache.fetch("city", { expiresIn: hours(1), version: 2 }, () => "Duckburgh")
//   cache.increment("hits")
//
// Keys may be strings, numbers, arrays (joined with "/"), plain objects
// (sorted query string), or anything with cacheKey() (and optionally cacheVersion()).
// Durations may be Duration instances or numbers of seconds.
import { Notifications } from "./notifications.js";
import { isPlainObject, toParam, ownHook } from "./core_ext/object.js";

/** @typedef {number | import("./duration.js").Duration} Seconds A number of seconds or a Duration. */

/**
 * @typedef {string | number | bigint | boolean | null | undefined
 *   | { cacheKey(): string, cacheVersion?(): unknown }
 *   | { toParam(): string }
 *   | Record<string, unknown>
 *   | unknown[]} CacheKey
 */

/** @typedef {string | (() => string)} Namespace */

/**
 * @typedef {object} CacheOptions
 * @property {Seconds} [expiresIn]
 * @property {Date | number} [expiresAt] A Date or Unix time in seconds.
 * @property {unknown} [version]
 * @property {Namespace} [namespace]
 * @property {boolean} [force]
 * @property {boolean} [skipNil]
 * @property {Seconds} [raceConditionTtl]
 * @property {boolean} [unlessExist]
 */

/**
 * @template T
 * @typedef {(name: CacheKey, info: { version: string | undefined, options: CacheOptions }) => T} FetchBlock
 */

/**
 * @param {Seconds | null | undefined} v
 * @returns {number | undefined}
 */
const toSeconds = (v) => (v === undefined || v === null ? undefined : Number(v.valueOf()));
const now = () => Date.now() / 1000;

export class Entry {
  /**
   * @param {unknown} value
   * @param {{ expiresIn?: Seconds, expiresAt?: Date | number, version?: string }} [options]
   */
  constructor(value, { expiresIn = undefined, expiresAt = undefined, version = undefined } = {}) {
    this.value = value;
    this.version = version;
    /** @type {number | undefined} Unix time in seconds. */
    this.expiresAt = expiresAt !== undefined
      ? (expiresAt instanceof Date ? expiresAt.getTime() / 1000 : Number(expiresAt))
      : expiresIn !== undefined ? now() + toSeconds(expiresIn) : undefined;
  }

  /** @returns {boolean} */
  isExpired() {
    return this.expiresAt !== undefined && this.expiresAt <= now();
  }

  /**
   * @param {string | undefined} version
   * @returns {boolean}
   */
  isMismatched(version) {
    return Boolean(this.version && version && this.version !== version);
  }

  /** @returns {number} */
  get size() {
    try {
      return JSON.stringify(this.value)?.length ?? 0;
    } catch {
      return 0;
    }
  }
}

/**
 * @template T
 * @param {T} value
 * @returns {T}
 */
function dup(value) {
  if (value === null || typeof value !== "object") return value;
  try {
    return structuredClone(value);
  } catch {
    return value;
  }
}

/**
 * @param {CacheKey} key
 * @param {Namespace} [namespace]
 * @returns {string}
 */
export function expandCacheKey(key, namespace) {
  const k = /** @type {any} */ (key);
  let expanded;
  if (k && typeof k.cacheKey === "function") expanded = k.cacheKey();
  else if (Array.isArray(k)) expanded = k.length ? k.map((x) => expandCacheKey(x)).join("/") : "";
  else if (isPlainObject(k)) {
    expanded = Object.keys(k).sort().map((x) => `${x}=${toParam(k[x])}`).join("/");
  } else if (ownHook(k, "toParam")) expanded = k.toParam();
  else expanded = String(k);
  return namespace ? `${typeof namespace === "function" ? namespace() : namespace}:${expanded}` : expanded;
}

/**
 * @param {CacheKey} key
 * @param {CacheOptions} options
 * @returns {string | undefined}
 */
function normalizeVersion(key, options) {
  const k = /** @type {any} */ (key);
  if (options.version !== undefined) return expandVersion(options.version);
  if (k && typeof k.cacheVersion === "function") return expandVersion(k.cacheVersion());
  if (Array.isArray(k)) {
    const versions = k.map((x) => (x && typeof x.cacheVersion === "function" ? x.cacheVersion() : undefined)).filter(Boolean);
    return versions.length ? versions.join("/") : undefined;
  }
  return undefined;
}

/**
 * @param {unknown} v
 * @returns {string | undefined}
 */
const expandVersion = (v) => (Array.isArray(v) ? v.map(String).join("/") : v === undefined || v === null ? undefined : String(v));

export class Store {
  /** @param {CacheOptions} [options] */
  constructor(options = {}) {
    /** @type {CacheOptions} */
    this.options = { ...options };
    this.silence = false;
  }

  /**
   * @param {CacheOptions} [callOptions]
   * @returns {CacheOptions}
   */
  mergedOptions(callOptions = {}) {
    return { ...this.options, ...callOptions };
  }

  /**
   * @param {CacheKey} key
   * @param {CacheOptions} [options]
   * @returns {string}
   */
  normalizeKey(key, options = {}) {
    return expandCacheKey(key, options.namespace ?? this.options.namespace);
  }

  /**
   * @template R
   * @param {string} operation
   * @param {string} key
   * @param {Record<string, unknown>} options
   * @param {(payload: Record<string, any>) => R} block
   * @returns {R}
   */
  instrument(operation, key, options, block) {
    /** @type {Record<string, any>} */
    const payload = { key, store: this.constructor.name };
    if (options && Object.keys(options).length) payload.options = options;
    return Notifications.instrument(`cache_${operation}.active_support`, payload, () => block(payload));
  }

  /**
   * Fetches data from the cache, or computes and stores it when missing.
   *   fetch(key, options?, block?)
   * @template T
   * @overload
   * @param {CacheKey} name
   * @param {FetchBlock<T>} options
   * @returns {T}
   */
  /**
   * @template T
   * @overload
   * @param {CacheKey} name
   * @param {CacheOptions} options
   * @param {FetchBlock<T>} block
   * @returns {T}
   */
  /**
   * @overload
   * @param {CacheKey} name
   * @param {CacheOptions} [options]
   * @returns {unknown}
   */
  /**
   * @param {CacheKey} name
   * @param {CacheOptions | FetchBlock<any>} [options]
   * @param {FetchBlock<any>} [block]
   * @returns {any}
   */
  fetch(name, options, block) {
    if (typeof options === "function") [options, block] = [{}, options];
    options = this.mergedOptions(options);
    const key = this.normalizeKey(name, options);
    const version = normalizeVersion(name, options);

    let entry;
    if (!options.force) {
      entry = this.instrument("read", key, options, (payload) => {
        const e = this.readEntry(key, options);
        const usable = e && !e.isExpired() && !e.isMismatched(version);
        if (e && !usable) {
          if (options.raceConditionTtl && e.isExpired() && block) {
            // Push the stale entry forward so other readers keep serving it
            // while this caller recomputes.
            e.expiresAt = now() + toSeconds(options.raceConditionTtl);
            this.writeEntry(key, e, { ...options, expiresIn: toSeconds(options.raceConditionTtl) * 2 });
          } else {
            this.deleteEntry(key, options);
          }
        }
        payload.hit = Boolean(usable);
        if (block) payload.superOperation = "fetch";
        return usable ? e : undefined;
      });
    }

    if (entry) {
      this.instrument("fetch_hit", key, options, () => {});
      return dup(entry.value);
    }
    if (!block) {
      if (options.force) throw new TypeError("Missing block: Calling `fetch` with `force: true` requires a block.");
      return undefined;
    }

    const value = this.instrument("generate", key, options, () => block(name, { version, options }));
    if (value && typeof value.then === "function") {
      return value.then((/** @type {unknown} */ resolved) => {
        this.#saveFetched(key, resolved, version, options);
        return resolved;
      });
    }
    this.#saveFetched(key, value, version, options);
    return value;
  }

  /**
   * @param {string} key
   * @param {unknown} value
   * @param {string | undefined} version
   * @param {CacheOptions} options
   */
  #saveFetched(key, value, version, options) {
    if (options.skipNil && (value === null || value === undefined)) return;
    this.instrument("write", key, options, () =>
      this.writeEntry(key, new Entry(dup(value), { ...options, version }), options),
    );
  }

  /**
   * @param {CacheKey} name
   * @param {CacheOptions} [options]
   * @returns {unknown}
   */
  read(name, options = {}) {
    options = this.mergedOptions(options);
    const key = this.normalizeKey(name, options);
    const version = normalizeVersion(name, options);
    return this.instrument("read", key, options, (payload) => {
      const entry = this.readEntry(key, options);
      if (!entry) {
        payload.hit = false;
        return undefined;
      }
      if (entry.isExpired()) {
        this.deleteEntry(key, options);
        payload.hit = false;
        return undefined;
      }
      if (entry.isMismatched(version)) {
        payload.hit = false;
        return undefined;
      }
      payload.hit = true;
      return dup(entry.value);
    });
  }

  /**
   * @param {CacheKey} name
   * @param {unknown} value
   * @param {CacheOptions} [options]
   * @returns {boolean}
   */
  write(name, value, options = {}) {
    options = this.mergedOptions(options);
    const key = this.normalizeKey(name, options);
    const version = normalizeVersion(name, options);
    return this.instrument("write", key, options, () =>
      this.writeEntry(key, new Entry(dup(value), { ...options, version }), options),
    );
  }

  /**
   * @param {CacheKey} name
   * @param {CacheOptions} [options]
   * @returns {boolean}
   */
  delete(name, options = {}) {
    options = this.mergedOptions(options);
    const key = this.normalizeKey(name, options);
    return this.instrument("delete", key, options, () => this.deleteEntry(key, options));
  }

  /**
   * @param {CacheKey} name
   * @param {CacheOptions} [options]
   * @returns {boolean}
   */
  exist(name, options = {}) {
    options = this.mergedOptions(options);
    const key = this.normalizeKey(name, options);
    const version = normalizeVersion(name, options);
    return this.instrument("exist?", key, options, () => {
      const entry = this.readEntry(key, options);
      return Boolean(entry && !entry.isExpired() && !entry.isMismatched(version));
    });
  }

  /**
   * readMulti("a", "b", options?)
   * @param {...(CacheKey | CacheOptions)} names
   * @returns {Record<string, unknown>}
   */
  readMulti(...names) {
    const options = isPlainObject(names.at(-1)) ? /** @type {CacheOptions} */ (names.pop()) : {};
    /** @type {Record<string, unknown>} */
    const out = {};
    for (const name of names) {
      const value = this.read(name, options);
      if (value !== undefined) out[String(name)] = value;
    }
    return out;
  }

  /**
   * @template {Record<string, unknown>} H
   * @param {H} hash
   * @param {CacheOptions} [options]
   * @returns {H}
   */
  writeMulti(hash, options = {}) {
    for (const [name, value] of Object.entries(hash)) this.write(name, value, options);
    return hash;
  }

  /**
   * fetchMulti("a", "b", options?, (name) => computed)
   * @param {...any} args Keys, an optional CacheOptions object, then the block.
   * @returns {Record<string, unknown>}
   */
  fetchMulti(...args) {
    const block = args.pop();
    if (typeof block !== "function") throw new TypeError("Missing block: `fetchMulti` requires a block.");
    const options = isPlainObject(args.at(-1)) ? args.pop() : {};
    /** @type {Record<string, unknown>} */
    const out = {};
    for (const name of args) out[name] = this.fetch(name, options, () => block(name));
    return out;
  }

  /**
   * @param {CacheKey[]} names
   * @param {CacheOptions} [options]
   * @returns {number}
   */
  deleteMulti(names, options = {}) {
    let count = 0;
    for (const name of names) if (this.delete(name, options)) count++;
    return count;
  }

  // Subclasses implement these.
  /**
   * @param {string} key
   * @param {CacheOptions} [options]
   * @returns {Entry | undefined}
   */
  readEntry(key, options) { throw new Error(`${this.constructor.name} does not implement readEntry`); }
  /**
   * @param {string} key
   * @param {Entry} entry
   * @param {CacheOptions} [options]
   * @returns {boolean}
   */
  writeEntry(key, entry, options) { throw new Error(`${this.constructor.name} does not implement writeEntry`); }
  /**
   * @param {string} key
   * @param {CacheOptions} [options]
   * @returns {boolean}
   */
  deleteEntry(key, options) { throw new Error(`${this.constructor.name} does not implement deleteEntry`); }
  /**
   * @param {CacheKey} name
   * @param {number} [amount]
   * @param {CacheOptions} [options]
   * @returns {number | undefined}
   */
  increment(name, amount, options) { throw new Error(`${this.constructor.name} does not support increment`); }
  /**
   * @param {CacheKey} name
   * @param {number} [amount]
   * @param {CacheOptions} [options]
   * @returns {number | undefined}
   */
  decrement(name, amount, options) { throw new Error(`${this.constructor.name} does not support decrement`); }
  /**
   * @param {RegExp | string} matcher
   * @param {CacheOptions} [options]
   * @returns {number}
   */
  deleteMatched(matcher, options) { throw new Error(`${this.constructor.name} does not support deleteMatched`); }
  /** @returns {void} */
  cleanup() { throw new Error(`${this.constructor.name} does not support cleanup`); }
  /** @returns {void} */
  clear() { throw new Error(`${this.constructor.name} does not support clear`); }
}

/**
 * @typedef {CacheOptions & { size?: number, sizeLimit?: number, maxPruneTime?: number }} MemoryStoreOptions
 */

/**
 * An in-process LRU cache. sizeLimit (default 32MB) bounds the approximate
 * JSON size of stored values; least recently used entries are pruned to 75%
 * of the limit when it is exceeded.
 */
export class MemoryStore extends Store {
  /** @param {MemoryStoreOptions} [options] */
  constructor(options = {}) {
    super(options);
    /** @type {Map<string, Entry>} */
    this.data = new Map();
    this.maxSize = options.size ?? options.sizeLimit ?? 32 * 1024 * 1024;
    this.maxPruneTime = options.maxPruneTime ?? 2;
    this.cacheSize = 0;
  }

  /** @returns {boolean} */
  static supportsCacheVersioning() { return true; }

  /**
   * @param {string} key
   * @param {CacheOptions} [options]
   * @returns {Entry | undefined}
   */
  readEntry(key, options) {
    const entry = this.data.get(key);
    if (entry) {
      // Re-insert to mark as most recently used.
      this.data.delete(key);
      this.data.set(key, entry);
    }
    return entry;
  }

  /**
   * @param {string} key
   * @param {Entry} entry
   * @param {CacheOptions} [options]
   * @returns {boolean}
   */
  writeEntry(key, entry, options = {}) {
    if (options.unlessExist) {
      const existing = this.data.get(key);
      if (existing && !existing.isExpired()) return false;
    }
    const old = this.data.get(key);
    if (old) this.cacheSize -= this.#entrySize(key, old);
    this.data.delete(key);
    this.data.set(key, entry);
    this.cacheSize += this.#entrySize(key, entry);
    if (this.cacheSize > this.maxSize) this.prune(this.maxSize * 0.75);
    return true;
  }

  /**
   * @param {string} key
   * @returns {boolean}
   */
  deleteEntry(key) {
    const entry = this.data.get(key);
    if (!entry) return false;
    this.cacheSize -= this.#entrySize(key, entry);
    this.data.delete(key);
    return true;
  }

  /**
   * @param {string} key
   * @param {Entry} entry
   * @returns {number}
   */
  #entrySize(key, entry) {
    return key.length + entry.size + 16;
  }

  /**
   * @param {number} targetSize
   * @param {number} [maxTime] Seconds.
   * @returns {void}
   */
  prune(targetSize, maxTime = this.maxPruneTime) {
    const start = now();
    this.cleanup();
    for (const key of this.data.keys()) {
      if (this.cacheSize <= targetSize || now() - start > maxTime) break;
      this.deleteEntry(key);
    }
  }

  /** @returns {void} */
  cleanup() {
    for (const [key, entry] of this.data) if (entry.isExpired()) this.deleteEntry(key);
  }

  /** @returns {void} */
  clear() {
    this.data.clear();
    this.cacheSize = 0;
  }

  /**
   * Increments a stored integer, initialising it to 0 when missing.
   * @param {CacheKey} name
   * @param {number} [amount]
   * @param {CacheOptions} [options]
   * @returns {number}
   */
  increment(name, amount = 1, options = {}) {
    return this.#modify(name, amount, options);
  }

  /**
   * @param {CacheKey} name
   * @param {number} [amount]
   * @param {CacheOptions} [options]
   * @returns {number}
   */
  decrement(name, amount = 1, options = {}) {
    return this.#modify(name, -amount, options);
  }

  /**
   * @param {CacheKey} name
   * @param {number} amount
   * @param {CacheOptions} options
   * @returns {number}
   */
  #modify(name, amount, options) {
    options = this.mergedOptions(options);
    const key = this.normalizeKey(name, options);
    const version = normalizeVersion(name, options);
    return this.instrument(amount >= 0 ? "increment" : "decrement", key, { amount, ...options }, () => {
      const entry = this.readEntry(key, options);
      const usable = entry && !entry.isExpired() && !entry.isMismatched(version);
      const current = usable ? Number(entry.value) : 0;
      const value = current + amount;
      const next = new Entry(value, usable ? { expiresAt: entry.expiresAt, version: entry.version } : { ...options, version });
      this.writeEntry(key, next, {});
      return value;
    });
  }

  /**
   * deleteMatched(/^user\//) removes every key matching the pattern.
   * @param {RegExp | string} matcher
   * @param {CacheOptions} [options]
   * @returns {number}
   */
  deleteMatched(matcher, options = {}) {
    options = this.mergedOptions(options);
    const ns = options.namespace;
    const prefix = ns ? `${typeof ns === "function" ? ns() : ns}:` : "";
    const re = matcher instanceof RegExp ? matcher : new RegExp(String(matcher));
    return this.instrument("delete_matched", String(matcher), options, () => {
      let count = 0;
      for (const key of [...this.data.keys()]) {
        if (!key.startsWith(prefix)) continue;
        re.lastIndex = 0;
        if (re.test(key.slice(prefix.length))) {
          this.deleteEntry(key);
          count++;
        }
      }
      return count;
    });
  }
}

/** A cache store that never stores anything; useful in development and tests. */
export class NullStore extends Store {
  /** @returns {boolean} */
  static supportsCacheVersioning() { return true; }
  /** @returns {undefined} */
  readEntry() { return undefined; }
  /** @returns {boolean} */
  writeEntry() { return true; }
  /** @returns {boolean} */
  deleteEntry() { return false; }
  /** @returns {undefined} */
  increment() { return undefined; }
  /** @returns {undefined} */
  decrement() { return undefined; }
  /** @returns {number} */
  deleteMatched() { return 0; }
  /** @returns {void} */
  cleanup() {}
  /** @returns {void} */
  clear() {}
}

/**
 * lookupStore("memory_store", { size: 1024 }) / lookupStore("null_store")
 * lookupStore(existingStore) returns it unchanged.
 * @param {Store | "memory_store" | "memory" | "memoryStore" | "null_store" | "null" | "nullStore" | null} [store]
 * @param {MemoryStoreOptions} [options]
 * @returns {Store}
 */
export function lookupStore(store, options) {
  if (store instanceof Store) return store;
  if (store === undefined || store === null) return new MemoryStore(options);
  switch (store) {
    case "memory_store": case "memory": case "memoryStore": return new MemoryStore(options);
    case "null_store": case "null": case "nullStore": return new NullStore(options);
    default: throw new TypeError(`Could not find cache store adapter for ${store}`);
  }
}

export const Cache = { Store, MemoryStore, NullStore, Entry, lookupStore, expandCacheKey };
