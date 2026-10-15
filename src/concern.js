// Port of ActiveSupport::Concern.
//
//   const Visible = concern({
//     dependsOn: [Trackable],               // included first, once
//     included(base) { base.visibleByDefault = true },
//     classMethods: { visible(items) { return items.filter((i) => i.visible) } },
//     instanceMethods: { hide() { this.visible = false } },
//   })
//   class Post {}
//   include(Post, Visible)
//
// Or as a mixin factory: class Post extends mixin(Base, Visible) {}

/**
 * @typedef {object} ConcernDefinition
 * @property {Concern[]} [dependsOn]
 * @property {(this: any, base: any) => void} [included]
 * @property {(this: any, base: any) => void} [prepended]
 * @property {Record<PropertyKey, unknown>} [classMethods]
 * @property {Record<PropertyKey, unknown>} [instanceMethods]
 * @property {string} [name]
 */

/**
 * A frozen concern definition. Methods it adds are copied onto classes at
 * runtime, so TypeScript doesn't see them on the class type.
 * @typedef {Readonly<{
 *   dependsOn: Concern[],
 *   included?: (this: any, base: any) => void,
 *   prepended?: (this: any, base: any) => void,
 *   classMethods: Record<PropertyKey, unknown>,
 *   instanceMethods: Record<PropertyKey, unknown>,
 *   name?: string,
 *   isConcern: true,
 * }>} Concern
 */

const INCLUDED = Symbol("activejs.concern.included");

/**
 * @param {object} target
 * @param {object} source
 */
const copyDescriptors = (target, source) => {
  for (const key of Reflect.ownKeys(source)) {
    Object.defineProperty(target, key, { ...Object.getOwnPropertyDescriptor(source, key), enumerable: false });
  }
};

/**
 * @param {ConcernDefinition} [definition]
 * @returns {Concern}
 */
export function concern({ dependsOn = [], included, prepended, classMethods = {}, instanceMethods = {}, name } = {}) {
  return Object.freeze({ dependsOn, included, prepended, classMethods, instanceMethods, name, isConcern: /** @type {const} */ (true) });
}

/**
 * Includes each concern into klass (and its dependencies first). A concern is
 * only ever included once per class, mirroring Ruby's ancestor check.
 * @template {Function} K
 * @param {K} klass
 * @param {...Concern} concerns
 * @returns {K}
 */
export function include(klass, ...concerns) {
  if (!Object.hasOwn(klass, INCLUDED)) {
    Object.defineProperty(klass, INCLUDED, { value: new Set(klass[INCLUDED] ?? []), enumerable: false });
  }
  for (const c of concerns) {
    if (klass[INCLUDED].has(c)) continue;
    include(klass, ...c.dependsOn);
    klass[INCLUDED].add(c);
    copyDescriptors(klass.prototype, c.instanceMethods);
    copyDescriptors(klass, c.classMethods);
    c.included?.call(klass, klass);
  }
  return klass;
}

/**
 * Like include, but the concern's methods wrap the class's own, the way
 * prepend puts a module in front of a class: each replacement receives the
 * original method as its first argument (`original`).
 * @template {Function} K
 * @param {K} klass
 * @param {...Concern} concerns
 * @returns {K}
 */
export function prepend(klass, ...concerns) {
  for (const c of concerns) {
    for (const key of Reflect.ownKeys(c.instanceMethods)) {
      const original = Object.getOwnPropertyDescriptor(klass.prototype, key)?.value
        ?? Object.getPrototypeOf(klass.prototype)?.[key];
      const replacement = c.instanceMethods[key];
      if (typeof replacement === "function" && typeof original === "function") {
        Object.defineProperty(klass.prototype, key, {
          /** @param {...unknown} args */
          value: function (...args) { return replacement.call(this, original.bind(this), ...args); },
          writable: true, configurable: true,
        });
      } else {
        Object.defineProperty(klass.prototype, key, Object.getOwnPropertyDescriptor(c.instanceMethods, key));
      }
    }
    copyDescriptors(klass, c.classMethods);
    c.prepended?.call(klass, klass);
  }
  return klass;
}

/**
 * @param {Function} klass
 * @param {Concern} c
 * @returns {boolean}
 */
export const includes = (klass, c) => Boolean(klass[INCLUDED]?.has(c));

/**
 * class Post extends mixin(Base, Visible, Trackable) {}
 * @template {new (...args: any[]) => {}} TBase
 * @param {TBase} Base
 * @param {...Concern} concerns
 * @returns {TBase}
 */
export function mixin(Base, ...concerns) {
  const Mixed = class extends Base {};
  Object.defineProperty(Mixed, "name", { value: Base.name });
  return include(Mixed, ...concerns);
}
