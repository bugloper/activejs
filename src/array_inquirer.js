// Port of ActiveSupport::ArrayInquirer.
//
//   const variants = new ArrayInquirer(["phone", "tablet"])
//   variants.phone()                  // => true
//   variants.desktop()                // => false
//   variants.any("phone", "desktop")  // => true

/**
 * An ArrayInquirer as TypeScript sees it: any unknown method is a predicate.
 * @typedef {ArrayInquirer & { [predicate: string]: () => boolean }} Inquiry
 */

/** @extends {Array<string>} */
export class ArrayInquirer extends Array {
  static get [Symbol.species]() {
    return Array;
  }

  /** @param {...(string | string[])} items */
  constructor(...items) {
    super();
    const list = /** @type {string[]} */ (items.length === 1 && Array.isArray(items[0]) ? items[0] : items);
    this.push(...list);
    return new Proxy(this, {
      get(target, prop, receiver) {
        if (typeof prop === "symbol" || prop in target || /^\d+$/.test(prop)) {
          return Reflect.get(target, prop, receiver);
        }
        return () => target.includes(prop);
      },
    });
  }

  /**
   * @param {...unknown} candidates
   * @returns {boolean}
   */
  any(...candidates) {
    if (candidates.length === 0) return this.length > 0;
    return candidates.some((c) => this.includes(String(c)));
  }
}
