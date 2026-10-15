// Port of ActiveSupport::Rescuable.
//
//   class Controller extends Rescuable() {
//     static {
//       this.rescueFrom(UserNotAuthorized, "deny")
//       this.rescueFrom(ValidationError, TypeError, (controller, e) => controller.render(e))
//       this.rescueFrom("ActiveRecord::RecordInvalid", "showErrors")  // by error name
//     }
//     handle() {
//       try { ... } catch (e) { if (!this.rescueWithHandler(e)) throw e }
//     }
//   }
//
// Handlers declared later (and in subclasses) take precedence, as in Rails.

/**
 * An error class, or an error class name matched against the error's
 * prototype chain and `name`.
 * @typedef {string | (abstract new (...args: any[]) => unknown)} ErrorMatcher
 */

/**
 * A method name on the target, or a function receiving (target, error).
 * @typedef {string | ((target: any, error: any) => unknown)} RescueHandler
 */

const HANDLERS = Symbol("activejs.rescuable.handlers");

/**
 * @param {Function} klass
 * @returns {Array<[ErrorMatcher, RescueHandler]>}
 */
function handlersFor(klass) {
  /** @type {Array<[ErrorMatcher, RescueHandler]>} */
  const out = [];
  for (let k = klass; k && k !== Function.prototype; k = Object.getPrototypeOf(k)) {
    if (Object.hasOwn(k, HANDLERS)) out.unshift(...k[HANDLERS]);
  }
  return out;
}

/**
 * rescueFrom(klass, ErrorClass, ..., handler) or (..., { with: handler })
 * @param {Function} klass
 * @param {...(ErrorMatcher | RescueHandler | { with: RescueHandler })} rawArgs
 *   One or more error matchers followed by the handler.
 * @returns {void}
 */
export function rescueFrom(klass, ...rawArgs) {
  const args = /** @type {any[]} */ (rawArgs);
  let handler = args.pop();
  if (handler && typeof handler === "object" && "with" in handler) handler = handler.with;
  if (args.length === 0) throw new TypeError("Need an error class or name to rescue from");
  if (!Object.hasOwn(klass, HANDLERS)) Object.defineProperty(klass, HANDLERS, { value: [], enumerable: false });
  for (const errorClass of args) klass[HANDLERS].push([errorClass, handler]);
}

/**
 * @param {ErrorMatcher} errorClass
 * @param {unknown} error
 */
const matches = (errorClass, error) =>
  typeof errorClass === "string"
    ? errorChainNames(error).includes(errorClass)
    : typeof errorClass === "function" && error instanceof errorClass;

/** @param {any} error */
function errorChainNames(error) {
  /** @type {string[]} */
  const names = [];
  for (let p = Object.getPrototypeOf(error); p && p !== Object.prototype; p = Object.getPrototypeOf(p)) {
    names.push(p.constructor.name);
  }
  if (error?.name) names.push(error.name);
  return names;
}

/**
 * @param {object} target A class, or an instance whose class declared handlers.
 * @param {unknown} error
 * @returns {RescueHandler | undefined}
 */
export function handlerForRescue(target, error) {
  const handlers = handlersFor(typeof target === "function" ? target : target.constructor);
  for (let i = handlers.length - 1; i >= 0; i--) {
    const [errorClass, handler] = handlers[i];
    if (matches(errorClass, error)) return handler;
  }
  return undefined;
}

/**
 * Calls the matching handler and returns true; also tries error.cause, like
 * Ruby retrying with exception.cause. Returns false when nothing matched.
 * @param {any} target
 * @param {any} error
 * @param {Set<unknown>} [visited]
 * @returns {boolean}
 */
export function rescueWithHandler(target, error, visited = new Set()) {
  if (!error || visited.has(error)) return false;
  visited.add(error);
  const handler = handlerForRescue(target, error);
  if (handler) {
    if (typeof handler === "string") target[handler].length === 0 ? target[handler]() : target[handler](error);
    else handler.call(target, target, error);
    return true;
  }
  return rescueWithHandler(target, error.cause, visited);
}

/**
 * @template {new (...args: any[]) => {}} [TBase=new (...args: any[]) => {}]
 * @param {TBase} [Base]
 */
export const Rescuable = (Base = /** @type {TBase} */ (/** @type {unknown} */ (Object))) =>
  class extends Base {
    /**
     * @param {...(ErrorMatcher | RescueHandler | { with: RescueHandler })} args
     * @returns {void}
     */
    static rescueFrom(...args) { rescueFrom(this, ...args); }
    /**
     * @param {unknown} error
     * @returns {boolean}
     */
    static rescueWithHandler(error) { return rescueWithHandler(this, error); }
    /**
     * @param {unknown} error
     * @returns {boolean}
     */
    rescueWithHandler(error) { return rescueWithHandler(this, error); }
    /**
     * @param {unknown} error
     * @returns {RescueHandler | undefined}
     */
    handlerForRescue(error) { return handlerForRescue(this, error); }
  };
