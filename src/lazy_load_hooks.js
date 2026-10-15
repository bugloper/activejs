// Port of ActiveSupport::LazyLoadHooks.
//
//   onLoad("active_record", (base) => base.include(MyExtension))
//   // ...later, when ActiveRecord::Base is ready:
//   runLoadHooks("active_record", ActiveRecord.Base)
//
// Hooks registered after runLoadHooks fire immediately. With { yield: true }
// the hook receives the base as an argument instead of as `this`.
/**
 * @typedef {object} LoadHookOptions
 * @property {boolean} [yield] Pass the base as an argument instead of as `this`.
 * @property {boolean} [runOnce] Run at most once per base.
 */

/** @typedef {(this: any, base: any) => void} LoadHook */

/** @type {Map<string, Array<[LoadHook, LoadHookOptions]>>} */
const loadHooks = new Map();
/** @type {Map<string, unknown[]>} */
const loaded = new Map();
/** @type {Map<LoadHook, Set<unknown>>} */
const ran = new Map(); // hook => Set of bases already executed (for runOnce)

/**
 * @param {string} name
 * @param {LoadHook} fn
 * @param {LoadHookOptions} [options]
 * @returns {void}
 */
export function onLoad(name, fn, options = {}) {
  for (const base of loaded.get(name) ?? []) execute(fn, base, options);
  if (!loadHooks.has(name)) loadHooks.set(name, []);
  loadHooks.get(name).push([fn, options]);
}

/**
 * @param {string} name
 * @param {unknown} [base]
 * @returns {void}
 */
export function runLoadHooks(name, base = globalThis) {
  if (!loaded.has(name)) loaded.set(name, []);
  loaded.get(name).push(base);
  for (const [fn, options] of loadHooks.get(name) ?? []) execute(fn, base, options);
}

/**
 * @param {LoadHook} fn
 * @param {unknown} base
 * @param {LoadHookOptions} options
 */
function execute(fn, base, options) {
  if (options.runOnce) {
    if (!ran.has(fn)) ran.set(fn, new Set());
    if (ran.get(fn).has(base)) return;
    ran.get(fn).add(base);
  }
  if (options.yield) fn(base);
  else fn.call(base, base);
}
