// Copyright 2018-2025 the Deno authors. MIT license.
import {
  undefined,
  DataViewPrototypeGetBuffer,
  Uint32Array,
  Uint8Array,
  SetPrototypeHas,
  RangeError,
  Error
} from "./primordials.js";
import {
  isTypedArray,
  TypedArrayPrototypeGetBuffer,
  isDataView,
  SafeSet,
} from "./primordial-utils.js";

import * as webidl from "./webidl.js";

const Utf8Labels = new SafeSet([
  "unicode-1-1-utf-8",
  "unicode11utf8",
  "unicode20utf8",
  "utf-8",
  "utf8",
  "x-unicode20utf8",
]);

/** @typedef {{ fatal?: boolean; ignoreBOM?: boolean; }} TextDecoderOptions */
/** @typedef {{ read: number; written: number; }} TextEncoderEncodeIntoResult */

/**
 * @param {import('./bootstrap.js').Internals} internals
 */
export function createEncodingClasses(internals) {
  class TextDecoder {
    /** @type {boolean} */
    #fatal;
    /** @type {boolean} */
    #ignoreBOM;

    /**
     * @param {string} label
     * @param {TextDecoderOptions} options
     */
    constructor(
      label = "utf-8",
      options = /** @type {{}} */ ({ __proto__: null })
    ) {
      const prefix = "Failed to construct 'TextDecoder'";
      label = webidl.converters.DOMString(label, prefix, "Argument 1");
      options = webidl.converters["TextDecoderOptions"]?.(
        options,
        prefix,
        "Argument 2"
      );
      if (!SetPrototypeHas(Utf8Labels, label)) {
        throw webidl.makeException(
          RangeError,
          "TextDecoder constructor",
          `The given encoding '${label}' is not supported.`
        );
      }
      this.#fatal = /** @type {boolean} */ (options.fatal);
      this.#ignoreBOM = /** @type {boolean} */ (options.ignoreBOM);
      this[webidl.brand] = webidl.brand;
    }

    /** @returns {string} */
    get encoding() {
      webidl.assertBranded(this, TextDecoderPrototype);
      return "utf-8";
    }

    /** @returns {boolean} */
    get fatal() {
      webidl.assertBranded(this, TextDecoderPrototype);
      return this.#fatal;
    }

    /** @returns {boolean} */
    get ignoreBOM() {
      webidl.assertBranded(this, TextDecoderPrototype);
      return this.#ignoreBOM;
    }

    /**
     * @param {ArrayBufferView | ArrayBuffer} [input]
     */
    decode(input = new Uint8Array()) {
      webidl.assertBranded(this, TextDecoderPrototype);
      const prefix = "Failed to execute 'decode' on 'TextDecoder'";
      if (input !== undefined) {
        input = webidl.converters.BufferSource(input, prefix, "Argument 1", {
          allowShared: false,
        });
      }

      let buffer = /** @type {ArrayBuffer} */ (input);
      if (isTypedArray(input)) {
        buffer = /** @type {ArrayBuffer} */ (
          TypedArrayPrototypeGetBuffer(/** @type {Uint8Array} */ input)
        );
      } else if (isDataView(input)) {
        buffer = /** @type {ArrayBuffer} */ (
          DataViewPrototypeGetBuffer(/** @type {DataView} */ input)
        );
      }

      try {
        return internals.decode_utf8(
          buffer,
          /** @type {ArrayBufferView} */ (input).byteOffset ?? 0,
          this.#fatal,
          this.#ignoreBOM
        );
      } catch {
        throw new Error("native decode error");
      }
    }
  }

  webidl.configureInterface(TextDecoder);
  const TextDecoderPrototype = TextDecoder.prototype;

  class TextEncoder {
    constructor() {
      this[webidl.brand] = webidl.brand;
    }

    /** @returns {string} */
    get encoding() {
      webidl.assertBranded(this, TextEncoderPrototype);
      return "utf-8";
    }

    /**
     * @param {string} input
     * @returns {Uint8Array}
     */
    encode(input = "") {
      webidl.assertBranded(this, TextEncoderPrototype);
      // The WebIDL type of `input` is `USVString`, but `core.encode` already
      // converts lone surrogates to the replacement character.
      input = webidl.converters.DOMString(
        input,
        "Failed to execute 'encode' on 'TextEncoder'",
        "Argument 1"
      );
      return new Uint8Array(internals.encode_utf8(input));
    }

    /**
     * @param {string} source
     * @param {Uint8Array} destination
     * @returns {TextEncoderEncodeIntoResult}
     */
    encodeInto(source, destination) {
      webidl.assertBranded(this, TextEncoderPrototype);
      const prefix = "Failed to execute 'encodeInto' on 'TextEncoder'";
      // The WebIDL type of `source` is `USVString`, but the ops bindings
      // already convert lone surrogates to the replacement character.
      source = webidl.converters.DOMString(source, prefix, "Argument 1");
      destination = webidl.converters.Uint8Array(
        destination,
        prefix,
        "Argument 2",
        {
          allowShared: true,
        }
      );
      // @ts-expect-error todo
      internals.encode_utf8_into(source, destination, encodeIntoBuf);
      return {
        read: encodeIntoBuf[0],
        written: encodeIntoBuf[1],
      };
    }
  }

  const encodeIntoBuf = /** @type {Uint32Array & {0: number, 1: number}} */ (
    new Uint32Array(2)
  );

  webidl.configureInterface(TextEncoder);
  const TextEncoderPrototype = TextEncoder.prototype;

  webidl.converters["TextDecoderOptions"] = webidl.createDictionaryConverter(
    "TextDecoderOptions",
    [
      {
        key: "fatal",
        converter: webidl.converters.boolean,
        defaultValue: false,
      },
      {
        key: "ignoreBOM",
        converter: webidl.converters.boolean,
        defaultValue: false,
      },
    ]
  );

  return { TextDecoder, TextEncoder };
}
