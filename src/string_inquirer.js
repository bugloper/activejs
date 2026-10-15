// Port of ActiveSupport::StringInquirer.
//
//   const env = new StringInquirer("production")
//   env.production()  // => true
//   env.development() // => false
//
// Any method name that isn't a real String method becomes an equality check.

/**
 * A StringInquirer as TypeScript sees it: any unknown method is a predicate.
 * @typedef {StringInquirer & { [predicate: string]: () => boolean }} Inquiry
 */

export class StringInquirer extends String {
  /** @param {unknown} value */
  constructor(value) {
    super(value);
    return new Proxy(this, {
      get(target, prop) {
        if (typeof prop === "symbol" || prop in target) {
          const value = Reflect.get(target, prop, target);
          return typeof value === "function" ? value.bind(target) : value;
        }
        return () => target.valueOf() === prop;
      },
    });
  }
}
