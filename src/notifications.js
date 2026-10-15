// Port of ActiveSupport::Notifications.
//
//   const sub = Notifications.subscribe("render", (event) => {
//     event.name      // => "render"
//     event.duration  // => 10 (ms)
//     event.payload   // => { extra: "information" }
//   })
//   Notifications.instrument("render", { extra: "information" }, () => renderTemplate())
//   Notifications.unsubscribe(sub)
//
// Patterns may be a string (exact match), a RegExp, or omitted (everything).
// A callback taking one argument receives an Event; otherwise it receives
// (name, start, finish, id, payload) like Rails' five-argument blocks.
// instrument() understands async blocks: the event finishes when the promise
// settles.
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";

/** @typedef {Record<string, any>} Payload */
/** @typedef {Date | number} Timestamp Wall-clock Date, or performance.now() milliseconds for monotonic subscribers. */
/** @typedef {string | RegExp | null | undefined} Pattern */

/** @typedef {(event: Event) => void} EventCallback */
/**
 * @typedef {(name: string, start: Timestamp, finish: Timestamp, id: string, payload: Payload) => void} TimedCallback
 */
/**
 * @typedef {object} EventedListener
 * @property {(name: string, id: string, payload: Payload) => void} start
 * @property {(name: string, id: string, payload: Payload) => void} finish
 * @property {(name: string) => boolean} [silenced]
 */
/**
 * @typedef {object} TimedListener
 * @property {(name: string, start: Timestamp, finish: Timestamp, id: string, payload: Payload) => void} call
 * @property {(name: string) => boolean} [silenced]
 */
/**
 * @typedef {object} EventListener
 * @property {(event: Event) => void} publishEvent
 * @property {(name: string, ...args: any[]) => void} [publish]
 * @property {(name: string) => boolean} [silenced]
 */
/** @typedef {EventedListener | TimedListener | EventListener} Listener */
/** @typedef {EventCallback | TimedCallback | Listener} Subscribable */

export class Event {
  /**
   * @param {string} name
   * @param {Timestamp} start
   * @param {Timestamp} end
   * @param {string} transactionId
   * @param {Payload} payload
   */
  constructor(name, start, end, transactionId, payload) {
    this.name = name;
    this.payload = payload;
    this.time = start;
    this.end = end;
    this.transactionId = transactionId;
    /** @type {Event[]} */
    this.children = [];
  }

  /** @returns {void} */
  start() { this.time = performance.now(); }
  /** @returns {void} */
  finish() { this.end = performance.now(); }

  /**
   * Milliseconds between start and finish.
   * @returns {number}
   */
  get duration() {
    return Number(this.end) - Number(this.time);
  }
}

class Subscriber {
  /**
   * @param {Pattern} pattern
   * @param {Subscribable} delegate
   * @param {{ monotonic?: boolean }} [options]
   */
  constructor(pattern, delegate, { monotonic = false } = {}) {
    this.pattern = pattern;
    this.delegate = delegate;
    this.monotonic = monotonic;
    this.silenceable = Boolean(/** @type {any} */ (delegate)?.silenced);
  }

  /**
   * @param {string} name
   * @returns {boolean}
   */
  matches(name) {
    if (this.pattern === undefined || this.pattern === null) return true;
    if (this.pattern instanceof RegExp) {
      this.pattern.lastIndex = 0;
      return this.pattern.test(name);
    }
    return this.pattern === name;
  }

  /**
   * @param {string} name
   * @returns {boolean}
   */
  isSilenced(name) {
    const d = /** @type {any} */ (this.delegate);
    return typeof d?.silenced === "function" && d.silenced(name);
  }
}

export class Fanout {
  constructor() {
    /** @type {Subscriber[]} */
    this.subscribers = [];
  }

  /**
   * @overload
   * @param {EventCallback} pattern
   * @returns {Subscriber}
   */
  /**
   * @overload
   * @param {TimedCallback | Listener} pattern
   * @returns {Subscriber}
   */
  /**
   * @overload
   * @param {Pattern} pattern
   * @param {EventCallback} callback
   * @param {{ monotonic?: boolean }} [options]
   * @returns {Subscriber}
   */
  /**
   * @overload
   * @param {Pattern} pattern
   * @param {TimedCallback | Listener} callback
   * @param {{ monotonic?: boolean }} [options]
   * @returns {Subscriber}
   */
  /**
   * @param {Pattern | Subscribable} pattern
   * @param {Subscribable} [callback]
   * @param {{ monotonic?: boolean }} [options]
   * @returns {Subscriber}
   */
  subscribe(pattern, callback, options = {}) {
    if (typeof pattern === "function" || (pattern && typeof pattern === "object" && !(pattern instanceof RegExp))) {
      [pattern, callback] = [undefined, /** @type {Subscribable} */ (pattern)];
    }
    const subscriber = new Subscriber(/** @type {Pattern} */ (pattern), callback, options);
    this.subscribers.push(subscriber);
    return subscriber;
  }

  /**
   * Accepts the object returned by subscribe, or a name to drop every
   * subscriber with that exact string pattern.
   * @param {Subscriber | Subscribable | string} subscriberOrName
   * @returns {void}
   */
  unsubscribe(subscriberOrName) {
    this.subscribers = this.subscribers.filter((s) =>
      typeof subscriberOrName === "string"
        ? s.pattern !== subscriberOrName
        : s !== subscriberOrName && s.delegate !== subscriberOrName,
    );
  }

  /**
   * @param {string} name
   * @returns {Subscriber[]}
   */
  listenersFor(name) {
    return this.subscribers.filter((s) => s.matches(name) && !s.isSilenced(name));
  }

  /**
   * @param {string} name
   * @returns {boolean}
   */
  isListening(name) {
    return this.listenersFor(name).length > 0;
  }

  /**
   * Delivers a finished event to every matching subscriber.
   * @param {string} name
   * @param {Timestamp} start
   * @param {Timestamp} finish
   * @param {string} id
   * @param {Payload} payload
   * @param {Subscriber[]} [listeners]
   * @returns {Event}
   */
  deliver(name, start, finish, id, payload, listeners = this.listenersFor(name)) {
    const event = new Event(name, start, finish, id, payload);
    for (const s of listeners) {
      const d = /** @type {any} */ (s.delegate);
      if (typeof d === "function") {
        if (d.length === 1) d(event);
        else d(name, start, finish, id, payload);
      } else if (d && typeof d.call === "function" && typeof d.start !== "function") {
        d.call(name, start, finish, id, payload);
      } else if (d && typeof d.publishEvent === "function") {
        d.publishEvent(event);
      }
    }
    return event;
  }

  /**
   * @param {string} name
   * @param {...any} args
   * @returns {void}
   */
  publish(name, ...args) {
    for (const s of this.listenersFor(name)) {
      const d = /** @type {any} */ (s.delegate);
      if (typeof d === "function") d(name, ...args);
      else if (typeof d?.publish === "function") d.publish(name, ...args);
      else if (typeof d?.call === "function") d.call(name, ...args);
    }
  }

  /**
   * @param {Event} event
   * @returns {void}
   */
  publishEvent(event) {
    for (const s of this.listenersFor(event.name)) {
      const d = /** @type {any} */ (s.delegate);
      if (typeof d === "function") {
        if (d.length === 1) d(event);
        else d(event.name, event.time, event.end, event.transactionId, event.payload);
      } else if (typeof d?.publishEvent === "function") d.publishEvent(event);
    }
  }
}

export class Instrumenter {
  /** @param {Fanout} notifier */
  constructor(notifier) {
    this.notifier = notifier;
    this.id = randomUUID();
  }

  /**
   * @template T
   * @overload
   * @param {string} name
   * @param {(payload: Payload) => T} payload
   * @returns {T}
   */
  /**
   * @template T
   * @overload
   * @param {string} name
   * @param {Payload} payload
   * @param {(payload: Payload) => T} block
   * @returns {T}
   */
  /**
   * @overload
   * @param {string} name
   * @param {Payload} [payload]
   * @returns {undefined}
   */
  /**
   * @param {string} name
   * @param {Payload | ((payload: Payload) => any)} [payload]
   * @param {(payload: Payload) => any} [block]
   * @returns {any}
   */
  instrument(name, payload = {}, block) {
    if (typeof payload === "function") [payload, block] = [{}, /** @type {(payload: Payload) => any} */ (payload)];
    const data = /** @type {Payload} */ (payload);
    const listeners = this.notifier.listenersFor(name);
    // Listener objects with start/finish get both hooks, like Rails' Evented subscribers.
    const evented = listeners.filter((s) => typeof (/** @type {any} */ (s.delegate))?.start === "function");
    const timed = listeners.filter((s) => typeof (/** @type {any} */ (s.delegate))?.start !== "function");
    for (const s of evented) /** @type {EventedListener} */ (s.delegate).start(name, this.id, data);

    const startWall = new Date();
    const startMono = performance.now();
    const finish = () => {
      for (const s of timed) {
        const [start, end] = s.monotonic ? [startMono, performance.now()] : [startWall, new Date()];
        this.notifier.deliver(name, start, end, this.id, data, [s]);
      }
      for (const s of evented) /** @type {EventedListener} */ (s.delegate).finish(name, this.id, data);
    };
    /** @param {any} error */
    const recordError = (error) => {
      data.exception = [error?.constructor?.name ?? "Error", error?.message];
      data.exceptionObject = error;
    };

    if (!block) {
      finish();
      return undefined;
    }

    let result;
    try {
      result = block(data);
    } catch (error) {
      recordError(error);
      finish();
      throw error;
    }
    if (result && typeof result.then === "function") {
      return result.then(
        /** @param {unknown} value */
        (value) => { finish(); return value; },
        /** @param {unknown} error */
        (error) => { recordError(error); finish(); throw error; },
      );
    }
    finish();
    return result;
  }
}

export const notifier = new Fanout();
const instrumenter = new Instrumenter(notifier);

export const Notifications = {
  notifier,
  instrumenter,

  /**
   * @template T
   * @overload
   * @param {string} name
   * @param {(payload: Payload) => T} payload
   * @returns {T}
   */
  /**
   * @template T
   * @overload
   * @param {string} name
   * @param {Payload} payload
   * @param {(payload: Payload) => T} block
   * @returns {T}
   */
  /**
   * @overload
   * @param {string} name
   * @param {Payload} [payload]
   * @returns {undefined}
   */
  /**
   * @param {string} name
   * @param {Payload | ((payload: Payload) => any)} [payload]
   * @param {(payload: Payload) => any} [block]
   * @returns {any}
   */
  instrument(name, payload, block) {
    if (typeof payload === "function") [payload, block] = [{}, /** @type {(payload: Payload) => any} */ (payload)];
    if (notifier.isListening(name)) return instrumenter.instrument(name, payload ?? {}, block);
    return block ? block(payload ?? {}) : undefined;
  },

  /**
   * @overload
   * @param {EventCallback} pattern
   * @returns {Subscriber}
   */
  /**
   * @overload
   * @param {TimedCallback | Listener} pattern
   * @returns {Subscriber}
   */
  /**
   * @overload
   * @param {Pattern} pattern
   * @param {EventCallback} callback
   * @returns {Subscriber}
   */
  /**
   * @overload
   * @param {Pattern} pattern
   * @param {TimedCallback | Listener} callback
   * @returns {Subscriber}
   */
  /**
   * @param {Pattern | Subscribable} pattern
   * @param {Subscribable} [callback]
   * @returns {Subscriber}
   */
  subscribe(pattern, callback) {
    return notifier.subscribe(/** @type {any} */ (pattern), callback);
  },

  /**
   * Durations use performance.now() (milliseconds) instead of wall time.
   * @overload
   * @param {EventCallback} pattern
   * @returns {Subscriber}
   */
  /**
   * @overload
   * @param {TimedCallback | Listener} pattern
   * @returns {Subscriber}
   */
  /**
   * @overload
   * @param {Pattern} pattern
   * @param {EventCallback} callback
   * @returns {Subscriber}
   */
  /**
   * @overload
   * @param {Pattern} pattern
   * @param {TimedCallback | Listener} callback
   * @returns {Subscriber}
   */
  /**
   * @param {Pattern | Subscribable} pattern
   * @param {Subscribable} [callback]
   * @returns {Subscriber}
   */
  monotonicSubscribe(pattern, callback) {
    if (typeof pattern === "function") [pattern, callback] = [undefined, pattern];
    return notifier.subscribe(/** @type {Pattern} */ (pattern), callback, { monotonic: true });
  },

  /**
   * Subscribes only for the duration of the block.
   * @template T
   * @overload
   * @param {EventCallback} callback
   * @param {() => T} pattern
   * @returns {T}
   */
  /**
   * @template T
   * @overload
   * @param {TimedCallback | Listener} callback
   * @param {() => T} pattern
   * @returns {T}
   */
  /**
   * @template T
   * @overload
   * @param {EventCallback} callback
   * @param {Pattern} pattern
   * @param {() => T} block
   * @returns {T}
   */
  /**
   * @template T
   * @overload
   * @param {TimedCallback | Listener} callback
   * @param {Pattern} pattern
   * @param {() => T} block
   * @returns {T}
   */
  /**
   * @param {Subscribable} callback
   * @param {Pattern | (() => any)} pattern
   * @param {() => any} [block]
   * @returns {any}
   */
  subscribed(callback, pattern, block) {
    if (typeof pattern === "function" && block === undefined) [pattern, block] = [undefined, pattern];
    const sub = notifier.subscribe(/** @type {Pattern} */ (pattern), callback);
    let result;
    try {
      result = block();
    } catch (e) {
      notifier.unsubscribe(sub);
      throw e;
    }
    if (result && typeof result.then === "function") {
      return result.finally(() => notifier.unsubscribe(sub));
    }
    notifier.unsubscribe(sub);
    return result;
  },

  /**
   * @param {Subscriber | Subscribable | string} subscriberOrName
   * @returns {void}
   */
  unsubscribe(subscriberOrName) {
    notifier.unsubscribe(subscriberOrName);
  },

  /**
   * @param {string} name
   * @param {...any} args
   * @returns {void}
   */
  publish(name, ...args) {
    notifier.publish(name, ...args);
  },

  /**
   * @param {Event} event
   * @returns {void}
   */
  publishEvent(event) {
    notifier.publishEvent(event);
  },
};

export default Notifications;
