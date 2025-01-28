// Copyright 2018-2025 the Deno authors. MIT license.
import {
  internals as safe_internals,
  primordials,
  primordialUtils,
} from "emjs:internal/internals";
const {
  DataViewPrototypeGetBuffer,
  Uint32Array,
  Uint8Array,
  SetPrototypeHas,
  RangeError,
  Error,
  StringPrototypeToLowerCase,
  RegExpPrototypeSymbolReplace,
} = primordials;
const { isTypedArray, TypedArrayPrototypeGetBuffer, isDataView, SafeSet } =
  primordialUtils;

import * as safe_webidl from "emjs:internal/webidl";

const Utf8Labels = new SafeSet([
  "unicode-1-1-utf-8",
  "unicode11utf8",
  "unicode20utf8",
  "utf-8",
  "utf8",
  "x-unicode20utf8",
]);

interface TextDecoderOptions {
  fatal?: boolean;
  ignoreBOM?: boolean;
}

interface TextEncoderEncodeIntoResult {
  read: number;
  written: number;
}

class TextDecoder {
  #fatal: boolean;
  #ignoreBOM: boolean;

  constructor(
    rawLabel: unknown = "utf-8",
    rawOptions: unknown = { __proto__: null }
  ) {
    const prefix = "Failed to construct 'TextDecoder'";
    const label = safe_webidl.converters.DOMString(
      rawLabel,
      prefix,
      "Argument 1"
    );
    const options = safe_webidl.converters["TextDecoderOptions"](
      rawOptions,
      prefix,
      "Argument 2"
    );
    if (
      !SetPrototypeHas(
        Utf8Labels,
        RegExpPrototypeSymbolReplace(
          /^[\t\n\f\r ]+|[\t\n\f\r ]+$/g,
          StringPrototypeToLowerCase(label),
          ""
        )
      )
    ) {
      throw safe_webidl.makeException(
        RangeError,
        "TextDecoder constructor",
        `The given encoding '${label}' is not supported.`
      );
    }
    this.#fatal = options.fatal;
    this.#ignoreBOM = options.ignoreBOM;
    safe_webidl.brandInstance(this);
  }

  get encoding(): string {
    safe_webidl.assertBranded(this, TextDecoderPrototype);
    return "utf-8";
  }

  get fatal(): boolean {
    safe_webidl.assertBranded(this, TextDecoderPrototype);
    return this.#fatal;
  }

  get ignoreBOM(): boolean {
    safe_webidl.assertBranded(this, TextDecoderPrototype);
    return this.#ignoreBOM;
  }

  decode(rawInput: unknown): string {
    safe_webidl.assertBranded(this, TextDecoderPrototype);
    const prefix = "Failed to execute 'decode' on 'TextDecoder'";

    if (rawInput == null) {
      return "";
    }

    const input = safe_webidl.converters.BufferSource(
      rawInput,
      prefix,
      "Argument 1",
      {
        allowShared: false,
      }
    );

    let buffer: primordials.ArrayBuffer;
    if (isTypedArray(input)) {
      buffer = TypedArrayPrototypeGetBuffer(input);
    } else if (isDataView(input)) {
      buffer = DataViewPrototypeGetBuffer(input) as primordials.ArrayBuffer;
    } else {
      buffer = input as primordials.ArrayBuffer;
    }

    let offset = (input as ArrayBufferView).byteOffset ?? 0;
    let length = input.byteLength;

    if (length > 2 && !this.#ignoreBOM) {
      const sniff = new Uint8Array(buffer, offset, 3);
      if (sniff[0] === 0xef && sniff[1] === 0xbb && sniff[2] === 0xbf) {
        length = length - 3;
        offset = offset + 3;
      }
    }

    try {
      return safe_internals.decode_utf8(buffer, offset, length, this.#fatal);
    } catch {
      throw new Error("native decode error");
    }
  }
}

safe_webidl.configureInterface(TextDecoder);
const TextDecoderPrototype = TextDecoder.prototype;

class TextEncoder {
  constructor() {
    safe_webidl.brandInstance(this);
  }

  get encoding(): string {
    safe_webidl.assertBranded(this, TextEncoderPrototype);
    return "utf-8";
  }

  encode(input = ""): primordials.Uint8Array {
    safe_webidl.assertBranded(this, TextEncoderPrototype);
    // The WebIDL type of `input` is `USVString`, but `core.encode` already
    // converts lone surrogates to the replacement character.
    input = safe_webidl.converters.DOMString(
      input,
      "Failed to execute 'encode' on 'TextEncoder'",
      "Argument 1"
    );
    return new Uint8Array(safe_internals.encode_utf8(input));
  }

  encodeInto(
    source: string,
    destination: primordials.Uint8Array
  ): TextEncoderEncodeIntoResult {
    safe_webidl.assertBranded(this, TextEncoderPrototype);
    const prefix = "Failed to execute 'encodeInto' on 'TextEncoder'";
    // The WebIDL type of `source` is `USVString`, but the ops bindings
    // already convert lone surrogates to the replacement character.
    source = safe_webidl.converters.DOMString(source, prefix, "Argument 1");
    destination = safe_webidl.converters.Uint8Array(
      destination,
      prefix,
      "Argument 2",
      {
        allowShared: true,
      }
    );
    // @ts-expect-error todo
    safe_internals.encode_utf8_into(source, destination, encodeIntoBuf);
    return {
      read: encodeIntoBuf[0],
      written: encodeIntoBuf[1],
    };
  }
}

const encodeIntoBuf: InstanceType<typeof Uint32Array> & {
  0: number;
  1: number;
} = new Uint32Array(2) satisfies InstanceType<
  typeof Uint32Array
> as InstanceType<typeof Uint32Array> & { 0: number; 1: number };

safe_webidl.configureInterface(TextEncoder);
const TextEncoderPrototype = TextEncoder.prototype;

/** xxx {
    fatal?: boolean;
    ignoreBOM?: boolean;
} */
const TextDecoderOptions = safe_webidl.createDictionaryConverter(
  "TextDecoderOptions",
  [
    {
      __proto__: null,
      key: "fatal",
      converter: safe_webidl.converters.boolean,
      defaultValue: false,
    },
    {
      __proto__: null,
      key: "ignoreBOM",
      converter: safe_webidl.converters.boolean,
      defaultValue: false,
    },
  ] as const
);
declare module "emjs:internal/webidl" {
  interface Converters {
    TextDecoderOptions: typeof TextDecoderOptions;
  }
}
safe_webidl.converters["TextDecoderOptions"] = TextDecoderOptions;

export { TextDecoder, TextEncoder };

export function utf8Encode(string: string) {
  return new Uint8Array(safe_internals.encode_utf8(string));
}

export function utf8DecodeWithoutBOM(bytes: primordials.Uint8Array) {
  return safe_internals.decode_utf8(
    bytes.buffer as primordials.ArrayBuffer,
    bytes.byteOffset ?? 0,
    bytes.byteLength,
    false
  );
}
