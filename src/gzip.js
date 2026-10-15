// Port of ActiveSupport::Gzip.
//   const compressed = compress("hello")   // Buffer
//   decompress(compressed)                 // => "hello"
import zlib from "node:zlib";

/**
 * @param {string | Buffer} source
 * @param {{ level?: number, strategy?: number }} [options]
 * @returns {Buffer}
 */
export function compress(source, { level = zlib.constants.Z_DEFAULT_COMPRESSION, strategy = zlib.constants.Z_DEFAULT_STRATEGY } = {}) {
  return zlib.gzipSync(Buffer.isBuffer(source) ? source : Buffer.from(String(source)), { level, strategy });
}

/**
 * @overload
 * @param {Buffer | Uint8Array} source
 * @param {BufferEncoding} [encoding]
 * @returns {string}
 */
/**
 * @overload
 * @param {Buffer | Uint8Array} source
 * @param {null | false | ""} encoding
 * @returns {Buffer}
 */
/**
 * @param {Buffer | Uint8Array} source
 * @param {BufferEncoding | null | false | ""} [encoding]
 * @returns {string | Buffer}
 */
export function decompress(source, encoding = "utf8") {
  const out = zlib.gunzipSync(source);
  return encoding ? out.toString(encoding) : out;
}

export const Gzip = { compress, decompress };
