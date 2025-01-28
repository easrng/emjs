/* eslint-disable @typescript-eslint/no-explicit-any */
import { primordialUtils, primordials } from "emjs:internal/internals";

const {
  isDataView,
  isNonSharedArrayBuffer,
  isSharedArrayBuffer,
  isTypedArray,
  SafeRegExp,
  TypedArrayPrototypeGetBuffer,
  TypedArrayPrototypeGetSymbolToStringTag,
  SafeSet,
  ArrayIteratorPrototype,
} = primordialUtils;
const {
  globalThis,
  ArrayBufferIsView,
  ArrayPrototypeForEach,
  ArrayPrototypePush,
  ArrayPrototypeSort,
  BigInt,
  BigIntAsIntN,
  BigIntAsUintN,
  DataViewPrototypeGetBuffer,
  Float32Array,
  Float64Array,
  FunctionPrototypeBind,
  FunctionPrototypeCall,
  Int16Array,
  Int32Array,
  Int8Array,
  MathFloor,
  MathFround,
  MathMax,
  MathMin,
  MathPow,
  MathRound,
  MathTrunc,
  Number,
  NumberIsFinite,
  NumberIsNaN,
  NumberMAX_SAFE_INTEGER,
  NumberMIN_SAFE_INTEGER,
  ObjectAssign,
  ObjectCreate,
  ObjectDefineProperties,
  ObjectDefineProperty,
  ObjectGetOwnPropertyDescriptor,
  ObjectGetOwnPropertyDescriptors,
  ObjectGetPrototypeOf,
  ObjectHasOwn,
  ObjectPrototypeIsPrototypeOf,
  ObjectIs,
  PromisePrototypeThen,
  PromiseReject,
  PromiseResolve,
  ReflectApply,
  ReflectDefineProperty,
  ReflectGetOwnPropertyDescriptor,
  ReflectHas,
  ReflectOwnKeys,
  RegExpPrototypeTest,
  SetPrototypeEntries,
  SetPrototypeForEach,
  SetPrototypeKeys,
  SetPrototypeValues,
  SetPrototypeHas,
  SetPrototypeClear,
  SetPrototypeDelete,
  SetPrototypeAdd,
  String,
  StringPrototypeCharCodeAt,
  StringPrototypeToWellFormed,
  Symbol,
  TypeError,
  Uint16Array,
  Uint32Array,
  Uint8Array,
  Uint8ClampedArray,
  DataView,
} = primordials;

// Copyright 2018-2025 the Deno authors. MIT license.

// Adapted from https://github.com/jsdom/webidl-conversions.
// Copyright Domenic Denicola. Licensed under BSD-2-Clause License.
// Original license at https://github.com/jsdom/webidl-conversions/blob/master/LICENSE.md.

function makeException(
  ErrorType: any,
  message: string,
  prefix?: string,
  context?: string
) {
  return new ErrorType(
    `${prefix ? prefix + ": " : ""}${context ? context : "Value"} ${message}`
  );
}

function toNumber(value: unknown) {
  if (typeof value === "bigint") {
    throw new TypeError("Cannot convert a BigInt value to a number");
  }
  return Number(value);
}

function type(V: unknown) {
  if (V === null) {
    return "Null";
  }
  switch (typeof V) {
    case "undefined":
      return "Undefined";
    case "boolean":
      return "Boolean";
    case "number":
      return "Number";
    case "string":
      return "String";
    case "symbol":
      return "Symbol";
    case "bigint":
      return "BigInt";
    case "object":
    // Falls through
    case "function":
    // Falls through
    default:
      // Per ES spec, typeof returns an implementation-defined value that is not any of the existing ones for
      // uncallable non-standard exotic objects. Yet Type() which the Web IDL spec depends on returns Object for
      // such cases. So treat the default case as an object.
      return "Object";
  }
}

// Round x to the nearest integer, choosing the even integer if it lies halfway between two.
function evenRound(x: number) {
  // There are four cases for numbers with fractional part being .5:
  //
  // case |     x     | floor(x) | round(x) | expected | x <> 0 | x % 1 | x & 1 |   example
  //   1  |  2n + 0.5 |  2n      |  2n + 1  |  2n      |   >    |  0.5  |   0   |  0.5 ->  0
  //   2  |  2n + 1.5 |  2n + 1  |  2n + 2  |  2n + 2  |   >    |  0.5  |   1   |  1.5 ->  2
  //   3  | -2n - 0.5 | -2n - 1  | -2n      | -2n      |   <    | -0.5  |   0   | -0.5 ->  0
  //   4  | -2n - 1.5 | -2n - 2  | -2n - 1  | -2n - 2  |   <    | -0.5  |   1   | -1.5 -> -2
  // (where n is a non-negative integer)
  //
  // Branch here for cases 1 and 4
  if (
    (x > 0 && x % 1 === +0.5 && (x & 1) === 0) ||
    (x < 0 && x % 1 === -0.5 && (x & 1) === 1)
  ) {
    return censorNegativeZero(MathFloor(x));
  }

  return censorNegativeZero(MathRound(x));
}

function integerPart(n: number) {
  return censorNegativeZero(MathTrunc(n));
}

function sign(x: number) {
  return x < 0 ? -1 : 1;
}

function modulo(x: number, y: number) {
  // https://tc39.github.io/ecma262/#eqn-modulo
  // Note that http://stackoverflow.com/a/4467559/3191 does NOT work for large modulos
  const signMightNotMatch = x % y;
  if (sign(y) !== sign(signMightNotMatch)) {
    return signMightNotMatch + y;
  }
  return signMightNotMatch;
}

function censorNegativeZero(x: number) {
  return x === 0 ? 0 : x;
}

interface StringConverterOpts {
  /**
   * Whether to treat `null` value as an empty string.
   */
  treatNullAsEmptyString?: boolean;
}
interface BufferConverterOpts {
  /**
   * Whether to allow `SharedArrayBuffer` (not just `ArrayBuffer`).
   */
  allowShared?: boolean;
}

interface IntConverterOpts {
  /**
   * Whether to throw if the number is outside of the acceptable values for
   * this type.
   */
  enforceRange?: boolean;
  /**
   * Whether to clamp this number to the acceptable values for this type.
   */
  clamp?: boolean;
}

function createIntegerConversion(
  bitLength: number,
  typeOpts: { unsigned: any }
) {
  const isSigned = !typeOpts.unsigned;

  let lowerBound;
  let upperBound;
  if (bitLength === 64) {
    upperBound = NumberMAX_SAFE_INTEGER;
    lowerBound = !isSigned ? 0 : NumberMIN_SAFE_INTEGER;
  } else if (!isSigned) {
    lowerBound = 0;
    upperBound = MathPow(2, bitLength) - 1;
  } else {
    lowerBound = -MathPow(2, bitLength - 1);
    upperBound = MathPow(2, bitLength - 1) - 1;
  }

  const twoToTheBitLength = MathPow(2, bitLength);
  const twoToOneLessThanTheBitLength = MathPow(2, bitLength - 1);

  return (
    V: unknown,
    prefix: string | undefined = undefined,
    context: string | undefined = undefined,
    opts: IntConverterOpts = ObjectCreate(null)
  ) => {
    let x = toNumber(V);
    x = censorNegativeZero(x);

    if (opts.enforceRange) {
      if (!NumberIsFinite(x)) {
        throw makeException(
          TypeError,
          "is not a finite number",
          prefix,
          context
        );
      }

      x = integerPart(x);

      if (x < lowerBound || x > upperBound) {
        throw makeException(
          TypeError,
          `is outside the accepted range of ${lowerBound} to ${upperBound}, inclusive`,
          prefix,
          context
        );
      }

      return x;
    }

    if (!NumberIsNaN(x) && opts.clamp) {
      x = MathMin(MathMax(x, lowerBound), upperBound);
      x = evenRound(x);
      return x;
    }

    if (!NumberIsFinite(x) || x === 0) {
      return 0;
    }
    x = integerPart(x);

    // Math.pow(2, 64) is not accurately representable in JavaScript, so try to avoid these per-spec operations if
    // possible. Hopefully it's an optimization for the non-64-bitLength cases too.
    if (x >= lowerBound && x <= upperBound) {
      return x;
    }

    // These will not work great for bitLength of 64, but oh well. See the README for more details.
    x = modulo(x, twoToTheBitLength);
    if (isSigned && x >= twoToOneLessThanTheBitLength) {
      return x - twoToTheBitLength;
    }
    return x;
  };
}

function createLongLongConversion(
  bitLength: number,
  { unsigned }: { unsigned: boolean }
) {
  const upperBound = NumberMAX_SAFE_INTEGER;
  const lowerBound = unsigned ? 0 : NumberMIN_SAFE_INTEGER;
  const asBigIntN = unsigned ? BigIntAsUintN : BigIntAsIntN;

  return (
    V: unknown,
    prefix: string | undefined = undefined,
    context: string | undefined = undefined,
    opts: IntConverterOpts = ObjectCreate(null)
  ) => {
    let x = toNumber(V);
    x = censorNegativeZero(x);

    if (opts.enforceRange) {
      if (!NumberIsFinite(x)) {
        throw makeException(
          TypeError,
          "is not a finite number",
          prefix,
          context
        );
      }

      x = integerPart(x);

      if (x < lowerBound || x > upperBound) {
        throw makeException(
          TypeError,
          `is outside the accepted range of ${lowerBound} to ${upperBound}, inclusive`,
          prefix,
          context
        );
      }

      return x;
    }

    if (!NumberIsNaN(x) && opts.clamp) {
      x = MathMin(MathMax(x, lowerBound), upperBound);
      x = evenRound(x);
      return x;
    }

    if (!NumberIsFinite(x) || x === 0) {
      return 0;
    }

    let xBigInt = BigInt(integerPart(x));
    xBigInt = asBigIntN(bitLength, xBigInt);
    return Number(xBigInt);
  };
}

export interface Converters {
  any(v: any): any;
  /**
   * Convert a value into a `boolean` (bool).
   */
  boolean(
    v: any,
    prefix?: string,
    context?: string,
    opts?: IntConverterOpts
  ): boolean;
  /**
   * Convert a value into a `byte` (int8).
   */
  byte(
    v: any,
    prefix?: string,
    context?: string,
    opts?: IntConverterOpts
  ): number;
  /**
   * Convert a value into a `octet` (uint8).
   */
  octet(
    v: any,
    prefix?: string,
    context?: string,
    opts?: IntConverterOpts
  ): number;
  /**
   * Convert a value into a `short` (int16).
   */
  short(
    v: any,
    prefix?: string,
    context?: string,
    opts?: IntConverterOpts
  ): number;
  /**
   * Convert a value into a `unsigned short` (uint16).
   */
  ["unsigned short"](
    v: any,
    prefix?: string,
    context?: string,
    opts?: IntConverterOpts
  ): number;
  /**
   * Convert a value into a `long` (int32).
   */
  long(
    v: any,
    prefix?: string,
    context?: string,
    opts?: IntConverterOpts
  ): number;
  /**
   * Convert a value into a `unsigned long` (uint32).
   */
  ["unsigned long"](
    v: any,
    prefix?: string,
    context?: string,
    opts?: IntConverterOpts
  ): number;
  /**
   * Convert a value into a `long long` (int64).
   * **Note this is truncated to a JS number (53 bit precision).**
   */
  ["long long"](
    v: any,
    prefix?: string,
    context?: string,
    opts?: IntConverterOpts
  ): number;
  /**
   * Convert a value into a `unsigned long long` (uint64).
   * **Note this is truncated to a JS number (53 bit precision).**
   */
  ["unsigned long long"](
    v: any,
    prefix?: string,
    context?: string,
    opts?: IntConverterOpts
  ): number;
  /**
   * Convert a value into a `float` (f32).
   */
  float(v: any, prefix?: string, context?: string, opts?: any): number;
  /**
   * Convert a value into a `unrestricted float` (f32, infinity, or NaN).
   */
  ["unrestricted float"](
    v: any,
    prefix?: string,
    context?: string,
    opts?: any
  ): number;
  /**
   * Convert a value into a `double` (f64).
   */
  double(v: any, prefix?: string, context?: string, opts?: any): number;
  /**
   * Convert a value into a `unrestricted double` (f64, infinity, or NaN).
   */
  ["unrestricted double"](
    v: any,
    prefix?: string,
    context?: string,
    opts?: any
  ): number;
  /**
   * Convert a value into a `DOMString` (string).
   */
  DOMString(
    v: any,
    prefix?: string,
    context?: string,
    opts?: StringConverterOpts
  ): string;
  /**
   * Convert a value into a `ByteString` (string with only u8 codepoints).
   */
  ByteString(
    v: any,
    prefix?: string,
    context?: string,
    opts?: StringConverterOpts
  ): string;
  /**
   * Convert a value into a `USVString` (string with only valid non
   * surrogate Unicode code points).
   */
  USVString(
    v: any,
    prefix?: string,
    context?: string,
    opts?: StringConverterOpts
  ): string;
  /**
   * Convert a value into an `object` (object).
   */
  object(v: any, prefix?: string, context?: string, opts?: any): object;
  /**
   * Convert a value into an `ArrayBuffer` (ArrayBuffer).
   */
  ArrayBuffer(
    v: any,
    prefix?: string,
    context?: string,
    opts?: BufferConverterOpts
  ): primordials.ArrayBuffer;
  /**
   * Convert a value into a `DataView` (ArrayBuffer).
   */
  DataView(
    v: any,
    prefix?: string,
    context?: string,
    opts?: BufferConverterOpts
  ): InstanceType<typeof DataView>;
  /**
   * Convert a value into a `Int8Array` (Int8Array).
   */
  Int8Array(
    v: any,
    prefix?: string,
    context?: string,
    opts?: BufferConverterOpts
  ): InstanceType<typeof Int8Array>;
  /**
   * Convert a value into a `Int16Array` (Int16Array).
   */
  Int16Array(
    v: any,
    prefix?: string,
    context?: string,
    opts?: BufferConverterOpts
  ): InstanceType<typeof Int16Array>;
  /**
   * Convert a value into a `Int32Array` (Int32Array).
   */
  Int32Array(
    v: any,
    prefix?: string,
    context?: string,
    opts?: BufferConverterOpts
  ): InstanceType<typeof Int32Array>;
  /**
   * Convert a value into a `Uint8Array` (Uint8Array).
   */
  Uint8Array(
    v: any,
    prefix?: string,
    context?: string,
    opts?: BufferConverterOpts
  ): InstanceType<typeof Uint8Array>;
  /**
   * Convert a value into a `Uint16Array` (Uint16Array).
   */
  Uint16Array(
    v: any,
    prefix?: string,
    context?: string,
    opts?: BufferConverterOpts
  ): InstanceType<typeof Uint16Array>;
  /**
   * Convert a value into a `Uint32Array` (Uint32Array).
   */
  Uint32Array(
    v: any,
    prefix?: string,
    context?: string,
    opts?: BufferConverterOpts
  ): InstanceType<typeof Uint32Array>;
  /**
   * Convert a value into a `Uint8ClampedArray` (Uint8ClampedArray).
   */
  Uint8ClampedArray(
    v: any,
    prefix?: string,
    context?: string,
    opts?: BufferConverterOpts
  ): InstanceType<typeof Uint8ClampedArray>;
  /**
   * Convert a value into a `Float32Array` (Float32Array).
   */
  Float32Array(
    v: any,
    prefix?: string,
    context?: string,
    opts?: BufferConverterOpts
  ): InstanceType<typeof Float32Array>;
  /**
   * Convert a value into a `Float64Array` (Float64Array).
   */
  Float64Array(
    v: any,
    prefix?: string,
    context?: string,
    opts?: BufferConverterOpts
  ): InstanceType<typeof Float64Array>;
  /**
   * Convert a value into an `ArrayBufferView` (ArrayBufferView).
   */
  ArrayBufferView(
    v: any,
    prefix?: string,
    context?: string,
    opts?: BufferConverterOpts
  ): ArrayBufferView;
  /**
   * Convert a value into a `BufferSource` (ArrayBuffer or ArrayBufferView).
   */
  BufferSource(
    v: any,
    prefix?: string,
    context?: string,
    opts?: BufferConverterOpts
  ): primordials.ArrayBuffer | ArrayBufferView;
  /**
   * Convert a value into a `DOMTimeStamp` (u64). Alias for unsigned long long
   */
  DOMTimeStamp(
    v: any,
    prefix?: string,
    context?: string,
    opts?: IntConverterOpts
  ): number;
  /**
   * Convert a value into a `DOMHighResTimeStamp` (f64). Alias for double
   */
  DOMHighResTimeStamp(
    v: any,
    prefix?: string,
    context?: string,
    opts?: IntConverterOpts
  ): number;
  /**
   * Convert a value into a `Function` ((...args: any[]) => any).
   */
  Function(
    v: any,
    prefix?: string,
    context?: string,
    opts?: any
  ): (...args: any) => any;
  /**
   * Convert a value into a `VoidFunction` (() => void).
   */
  VoidFunction(
    v: any,
    prefix?: string,
    context?: string,
    opts?: any
  ): () => void;
  ["UVString?"](
    v: any,
    prefix?: string,
    context?: string,
    opts?: StringConverterOpts
  ): string | null;
  ["sequence<double>"](
    v: any,
    prefix?: string,
    context?: string,
    opts?: any
  ): number[];
  ["sequence<object>"](
    v: any,
    prefix?: string,
    context?: string,
    opts?: any
  ): object[];
  ["sequence<ByteString>"](
    v: any,
    prefix?: string,
    context?: string,
    opts?: any
  ): string[];
  ["sequence<USVString>"](
    v: any,
    prefix?: string,
    context?: string,
    opts?: any
  ): string[];
  ["sequence<DOMString>"](
    v: any,
    prefix?: string,
    context?: string,
    opts?: any
  ): string[];
  ["sequence<sequence<ByteString>>"](
    v: any,
    prefix?: string,
    context?: string,
    opts?: any
  ): string[][];
  ["sequence<sequence<USVString>>"](
    v: any,
    prefix?: string,
    context?: string,
    opts?: any
  ): string[][];
  ["Promise<undefined>"]: (
    v: any,
    prefix?: string,
    context?: string,
    opts?: any
  ) => primordials.Promise<undefined>;
  ["record<ByteString, ByteString>"]: (
    v: any,
    prefix?: string,
    context?: string,
    opts?: any
  ) => Record<string, string>;
  ["record<USVString, USVString>"]: (
    v: any,
    prefix?: string,
    context?: string,
    opts?: any
  ) => Record<string, string>;
  ["sequence<sequence<USVString>> or record<USVString, USVString> or USVString"]: (
    V: any,
    prefix?: string,
    context?: string,
    opts?: StringConverterOpts
  ) => string | Record<string, string> | string[][];
}
const safe_converters: Converters = ObjectCreate(null);

safe_converters.any = (V) => {
  return V;
};

safe_converters.boolean = function (val) {
  return !!val;
};

safe_converters.byte = createIntegerConversion(8, { unsigned: false });
safe_converters.octet = createIntegerConversion(8, { unsigned: true });

safe_converters.short = createIntegerConversion(16, { unsigned: false });
safe_converters["unsigned short"] = createIntegerConversion(16, {
  unsigned: true,
});

safe_converters.long = createIntegerConversion(32, { unsigned: false });
safe_converters["unsigned long"] = createIntegerConversion(32, {
  unsigned: true,
});

safe_converters["long long"] = createLongLongConversion(64, {
  unsigned: false,
});
safe_converters["unsigned long long"] = createLongLongConversion(64, {
  unsigned: true,
});

safe_converters.float = (V, prefix, context, _opts) => {
  const x = toNumber(V);

  if (!NumberIsFinite(x)) {
    throw makeException(
      TypeError,
      "is not a finite floating-point value",
      prefix,
      context
    );
  }

  if (ObjectIs(x, -0)) {
    return x;
  }

  const y = MathFround(x);

  if (!NumberIsFinite(y)) {
    throw makeException(
      TypeError,
      "is outside the range of a single-precision floating-point value",
      prefix,
      context
    );
  }

  return y;
};

safe_converters["unrestricted float"] = (V, _prefix, _context, _opts) => {
  const x = toNumber(V);

  if (NumberIsNaN(x)) {
    return x;
  }

  if (ObjectIs(x, -0)) {
    return x;
  }

  return MathFround(x);
};

safe_converters.double = (V, prefix, context, _opts) => {
  const x = toNumber(V);

  if (!NumberIsFinite(x)) {
    throw makeException(
      TypeError,
      "is not a finite floating-point value",
      prefix,
      context
    );
  }

  return x;
};

safe_converters["unrestricted double"] = (V, _prefix, _context, _opts) => {
  const x = toNumber(V);

  return x;
};

safe_converters.DOMString = function (
  V,
  prefix,
  context,
  opts = ObjectCreate(null)
) {
  if (typeof V === "string") {
    return V;
  } else if (V === null && opts.treatNullAsEmptyString) {
    return "";
  } else if (typeof V === "symbol") {
    throw makeException(
      TypeError,
      "is a symbol, which cannot be converted to a string",
      prefix,
      context
    );
  }

  return String(V);
};

function isByteString(input: string) {
  for (let i = 0; i < input.length; i++) {
    if (StringPrototypeCharCodeAt(input, i) > 255) {
      // If a character code is greater than 255, it means the string is not a byte string.
      return false;
    }
  }
  return true;
}

safe_converters.ByteString = (V, prefix, context, opts) => {
  const x = safe_converters.DOMString(V, prefix, context, opts);
  if (!isByteString(x)) {
    throw makeException(
      TypeError,
      "is not a valid ByteString",
      prefix,
      context
    );
  }
  return x;
};

safe_converters.USVString = (V, prefix, context, opts) => {
  const S = safe_converters.DOMString(V, prefix, context, opts);
  return StringPrototypeToWellFormed(S);
};

safe_converters.object = (V, prefix, context, _opts) => {
  if (type(V) !== "Object") {
    throw makeException(TypeError, "is not an object", prefix, context);
  }

  return V;
};

// Not exported, but used in Function and VoidFunction.

// Neither Function nor VoidFunction is defined with [TreatNonObjectAsNull], so
// handling for that is omitted.
function convertCallbackFunction(
  V: unknown,
  prefix: string | undefined,
  context: string | undefined,
  _opts: unknown
) {
  if (typeof V !== "function") {
    throw makeException(TypeError, "is not a function", prefix, context);
  }
  return V as (...args: any) => any;
}

safe_converters.ArrayBuffer = (
  V,
  prefix = undefined,
  context = undefined,
  opts = ObjectCreate(null)
) => {
  if (!isNonSharedArrayBuffer(V)) {
    if (opts.allowShared && !isSharedArrayBuffer(V)) {
      throw makeException(
        TypeError,
        "is not an ArrayBuffer or SharedArrayBuffer",
        prefix,
        context
      );
    }
    throw makeException(TypeError, "is not an ArrayBuffer", prefix, context);
  }

  return V;
};

safe_converters.DataView = (
  V,
  prefix = undefined,
  context = undefined,
  opts = ObjectCreate(null)
) => {
  if (!isDataView(V)) {
    throw makeException(TypeError, "is not a DataView", prefix, context);
  }

  if (!opts.allowShared && isSharedArrayBuffer(DataViewPrototypeGetBuffer(V))) {
    throw makeException(
      TypeError,
      "is backed by a SharedArrayBuffer, which is not allowed",
      prefix,
      context
    );
  }

  return V;
};

ArrayPrototypeForEach(
  [
    Int8Array,
    Int16Array,
    Int32Array,
    Uint8Array,
    Uint16Array,
    Uint32Array,
    Uint8ClampedArray,
    // TODO(petamoriken): add Float16Array converter
    // Float16Array,
    Float32Array,
    Float64Array,
  ],
  (func) => {
    const name = func.name as
      | "Int8Array"
      | "Int16Array"
      | "Int32Array"
      | "Uint8Array"
      | "Uint16Array"
      | "Uint32Array"
      | "Uint8ClampedArray"
      | "Float32Array"
      | "Float64Array";
    const article = RegExpPrototypeTest(new SafeRegExp(/^[AEIOU]/), name)
      ? "an"
      : "a";
    safe_converters[name] = (
      V,
      prefix = undefined,
      context = undefined,
      opts = ObjectCreate(null)
    ) => {
      if (TypedArrayPrototypeGetSymbolToStringTag(V) !== name) {
        throw makeException(
          TypeError,
          `is not ${article} ${name} object`,
          prefix,
          context
        );
      }
      if (
        !opts.allowShared &&
        isSharedArrayBuffer(TypedArrayPrototypeGetBuffer(V))
      ) {
        throw makeException(
          TypeError,
          "is a view on a SharedArrayBuffer, which is not allowed",
          prefix,
          context
        );
      }

      return V;
    };
  }
);

// Common definitions

safe_converters.ArrayBufferView = (
  V,
  prefix = undefined,
  context = undefined,
  opts = ObjectCreate(null)
) => {
  if (!ArrayBufferIsView(V)) {
    throw makeException(
      TypeError,
      "is not a view on an ArrayBuffer or SharedArrayBuffer",
      prefix,
      context
    );
  }
  let buffer;
  if (isTypedArray(V)) {
    buffer = TypedArrayPrototypeGetBuffer(V);
  } else {
    buffer = DataViewPrototypeGetBuffer(V);
  }
  if (!opts.allowShared && isSharedArrayBuffer(buffer)) {
    throw makeException(
      TypeError,
      "is a view on a SharedArrayBuffer, which is not allowed",
      prefix,
      context
    );
  }

  return V;
};

safe_converters.BufferSource = (
  V,
  prefix = undefined,
  context = undefined,
  opts = ObjectCreate(null)
) => {
  if (ArrayBufferIsView(V)) {
    let buffer;
    if (isTypedArray(V)) {
      buffer = TypedArrayPrototypeGetBuffer(V);
    } else {
      buffer = DataViewPrototypeGetBuffer(V);
    }
    if (!opts.allowShared && isSharedArrayBuffer(buffer)) {
      throw makeException(
        TypeError,
        "is a view on a SharedArrayBuffer, which is not allowed",
        prefix,
        context
      );
    }

    return V;
  }

  if (!opts.allowShared && !isNonSharedArrayBuffer(V)) {
    throw makeException(
      TypeError,
      "is not an ArrayBuffer or a view on one",
      prefix,
      context
    );
  }
  if (
    opts.allowShared &&
    !isSharedArrayBuffer(V) &&
    !isNonSharedArrayBuffer(V)
  ) {
    throw makeException(
      TypeError,
      "is not an ArrayBuffer, SharedArrayBuffer, or a view on one",
      prefix,
      context
    );
  }

  return V;
};

safe_converters.DOMTimeStamp = safe_converters["unsigned long long"];
safe_converters.DOMHighResTimeStamp = safe_converters["double"];

safe_converters.Function = convertCallbackFunction;

safe_converters.VoidFunction = convertCallbackFunction;

safe_converters["UVString?"] = createNullableConverter(
  safe_converters.USVString
);
safe_converters["sequence<double>"] = createSequenceConverter(
  safe_converters.double
);
safe_converters["sequence<object>"] = createSequenceConverter(
  safe_converters.object
);
safe_converters["Promise<undefined>"] = createPromiseConverter(() => undefined);

safe_converters["sequence<ByteString>"] = createSequenceConverter(
  safe_converters.ByteString
);
safe_converters["sequence<sequence<ByteString>>"] = createSequenceConverter(
  safe_converters["sequence<ByteString>"]
);
safe_converters["record<ByteString, ByteString>"] = createRecordConverter(
  safe_converters.ByteString,
  safe_converters.ByteString
);

safe_converters["sequence<USVString>"] = createSequenceConverter(
  safe_converters.USVString
);
safe_converters["sequence<sequence<USVString>>"] = createSequenceConverter(
  safe_converters["sequence<USVString>"]
);
safe_converters[
  "sequence<sequence<USVString>> or record<USVString, USVString> or USVString"
] = (
  V: any,
  prefix: string | undefined,
  context: string | undefined,
  opts: StringConverterOpts | undefined
): string | Record<string, string> | string[][] => {
  // Union for (sequence<sequence<USVString>> or record<USVString, USVString> or USVString)
  if (type(V) === "Object" && V !== null) {
    if (V[primordials.SymbolIterator] !== undefined) {
      return safe_converters["sequence<sequence<USVString>>"]!(
        V,
        prefix,
        context,
        opts
      );
    }
    return safe_converters["record<USVString, USVString>"]!(
      V,
      prefix,
      context,
      opts
    );
  }
  return safe_converters.USVString(V, prefix, context, opts);
};
safe_converters["record<USVString, USVString>"] = createRecordConverter(
  safe_converters.USVString,
  safe_converters.USVString
);

safe_converters["sequence<DOMString>"] = createSequenceConverter(
  safe_converters.DOMString
);

function requiredArguments(
  length: number,
  required: number,
  prefix: string
): void {
  if (length < required) {
    const errMsg = `${prefix ? prefix + ": " : ""}${required} argument${
      required === 1 ? "" : "s"
    } required, but only ${length} present`;
    throw new TypeError(errMsg);
  }
}

export type Dictionary = DictionaryMember[];
export interface DictionaryMember {
  __proto__: null;
  key: string;
  converter: (v: any, prefix?: string, context?: string, opts?: any) => any;
  defaultValue?: any;
  required?: boolean;
}

type DictionaryMemberValueType<T extends DictionaryMember, K> = T extends {
  key: K;
}
  ?
      | ReturnType<T["converter"]>
      | (T extends { defaultValue: infer D }
          ? D
          : T extends { required: true }
          ? never
          : undefined)
  : never;
type DictionaryType<T extends Dictionary> = T extends any
  ? {
      [K in T[number]["key"]]: DictionaryMemberValueType<T[number], K>;
    }
  : never;

function createDictionaryConverter<T extends Dictionary[]>(
  name: string,
  ...dictionaries: T
): (
  v: any,
  prefix?: string,
  context?: string,
  opts?: any
) => DictionaryType<T[number]> {
  let hasRequiredKey = false;
  const allMembers: DictionaryMember[] = [];
  for (let i = 0; i < dictionaries.length; ++i) {
    const members = dictionaries[i]!;
    for (let j = 0; j < members.length; ++j) {
      const member = members[j]!;
      if (member.required) {
        hasRequiredKey = true;
      }
      ArrayPrototypePush(allMembers, member);
    }
  }
  ArrayPrototypeSort(allMembers, (a, b) => {
    if (a.key == b.key) {
      return 0;
    }
    return a.key < b.key ? -1 : 1;
  });

  const defaultValues = ObjectCreate(null);
  for (let i = 0; i < allMembers.length; ++i) {
    const safe_member = allMembers[i]!;
    // safe to call props because proto is null
    void (safe_member.__proto__ satisfies null);
    if (ReflectHas(safe_member, "defaultValue")) {
      const idlMemberValue = safe_member.defaultValue;
      const imvType = typeof idlMemberValue;
      // Copy by value types can be directly assigned, copy by reference types
      // need to be re-created for each allocation.
      if (
        imvType === "number" ||
        imvType === "boolean" ||
        imvType === "string" ||
        imvType === "bigint" ||
        imvType === "undefined"
      ) {
        defaultValues[safe_member.key] = safe_member.converter(idlMemberValue);
      } else {
        ObjectDefineProperty(defaultValues, safe_member.key, {
          __proto__: null,
          get() {
            return safe_member.converter(
              idlMemberValue,
              safe_member.defaultValue
            );
          },
          enumerable: true,
        });
      }
    }
  }

  return function (
    V,
    prefix = undefined,
    context = undefined,
    opts = ObjectCreate(null)
  ) {
    const typeV = type(V);
    switch (typeV) {
      case "Undefined":
      case "Null":
      case "Object":
        break;
      default:
        throw makeException(
          TypeError,
          "can not be converted to a dictionary",
          prefix,
          context
        );
    }
    const esDict = V;

    const idlDict = ObjectAssign({}, defaultValues);

    // NOTE: fast path Null and Undefined.
    if ((V === undefined || V === null) && !hasRequiredKey) {
      return idlDict;
    }

    for (let i = 0; i < allMembers.length; ++i) {
      const member = allMembers[i]!;
      const key = member.key;

      let esMemberValue;
      if (typeV === "Undefined" || typeV === "Null") {
        esMemberValue = undefined;
      } else {
        esMemberValue = esDict[key];
      }

      if (esMemberValue !== undefined) {
        const memberContext = `'${key}' of '${name}'${
          context ? ` (${context})` : ""
        }`;
        const converter = member.converter;
        const idlMemberValue = converter(
          esMemberValue,
          prefix,
          memberContext,
          opts
        );
        idlDict[key] = idlMemberValue;
      } else if (member.required) {
        throw makeException(
          TypeError,
          `can not be converted to '${name}' because '${key}' is required in '${name}'`,
          prefix,
          context
        );
      }
    }

    return idlDict;
  };
}

// https://heycam.github.io/webidl/#es-enumeration
function createEnumConverter(
  name: string,
  values: string[]
): (v: any, prefix?: string, context?: string, opts?: any) => string {
  const safe_enumValues = new SafeSet(values);

  return function (
    V,
    prefix = undefined,
    _context = undefined,
    _opts = ObjectCreate(null)
  ) {
    const S = String(V);

    if (!safe_enumValues.has(S)) {
      throw new TypeError(
        `${
          prefix ? prefix + ": " : ""
        }The provided value '${S}' is not a valid enum value of type ${name}`
      );
    }

    return S;
  };
}

function createNullableConverter<T>(
  converter: (v: any, prefix?: string, context?: string, opts?: any) => T
): (v: any, prefix?: string, context?: string, opts?: any) => T | null {
  return (
    V,
    prefix = undefined,
    context = undefined,
    opts = ObjectCreate(null)
  ) => {
    // FIXME: If Type(V) is not Object, and the conversion to an IDL value is
    // being performed due to V being assigned to an attribute whose type is a
    // nullable callback function that is annotated with
    // [LegacyTreatNonObjectAsNull], then return the IDL nullable type T?
    // value null.

    if (V === null || V === undefined) return null;
    return converter(V, prefix, context, opts);
  };
}

// https://heycam.github.io/webidl/#es-sequence
function createSequenceConverter<T>(
  converter: (v: any, prefix?: string, context?: string, opts?: any) => T
): (v: any, prefix?: string, context?: string, opts?: any) => T[] {
  return function (
    V,
    prefix = undefined,
    context = undefined,
    opts = ObjectCreate(null)
  ) {
    if (type(V) !== "Object") {
      throw makeException(
        TypeError,
        "can not be converted to sequence.",
        prefix,
        context
      );
    }
    // eslint-disable-next-line no-restricted-syntax
    const iter = V?.[primordials.SymbolIterator]?.();
    if (iter === undefined) {
      throw makeException(
        TypeError,
        "can not be converted to sequence.",
        prefix,
        context
      );
    }
    const array: T[] = [];
    while (true) {
      // eslint-disable-next-line no-restricted-syntax
      const res = iter?.next?.();
      if (res === undefined) {
        throw makeException(
          TypeError,
          "can not be converted to sequence.",
          prefix,
          context
        );
      }
      if (res.done === true) break;
      const val = converter(
        res.value,
        prefix,
        `${context}, index ${array.length}`,
        opts
      );
      ArrayPrototypePush(array, val);
    }
    return array;
  };
}

function isAsyncIterable(obj: any) {
  if (obj[primordials.SymbolAsyncIterator] === undefined) {
    if (obj[primordials.SymbolIterator] === undefined) {
      return false;
    }
  }

  return true;
}

interface ConvertedAsyncIterable<V, T> {
  value: V;
  open(context?: string): AsyncIterableIterator<T>;
}

function createAsyncIterableConverter<V, T>(
  converter: (v: V, prefix?: string, context?: string, opts?: any) => T
): (
  v: any,
  prefix?: string,
  context?: string,
  opts?: any
) => ConvertedAsyncIterable<V, T> {
  return function (
    V,
    prefix = undefined,
    context = undefined,
    opts = ObjectCreate(null)
  ) {
    if (type(V) !== "Object") {
      throw makeException(
        TypeError,
        "can not be converted to async iterable.",
        prefix,
        context
      );
    }

    let isAsync = true;
    let method = V[primordials.SymbolAsyncIterator];
    if (method === undefined) {
      method = V[primordials.SymbolIterator];

      if (method === undefined) {
        throw makeException(TypeError, "is not iterable.", prefix, context);
      }

      isAsync = false;
    }

    return {
      value: V,
      open(context?: string): AsyncIterableIterator<T> {
        const iter = FunctionPrototypeCall(method, V);
        if (type(iter) !== "Object") {
          throw new TypeError(
            `${context} could not be iterated because iterator method did not return object, but ${type(
              iter
            )}.`
          );
        }

        let asyncIterator = iter;

        if (!isAsync) {
          asyncIterator = {
            async next() {
              // eslint-disable-next-line no-restricted-syntax
              return iter.next();
            },
          };
        }

        return {
          async next(_?: any) {
            // eslint-disable-next-line no-restricted-syntax
            const iterResult = await asyncIterator.next();
            if (type(iterResult) !== "Object") {
              throw TypeError(
                `${context} failed to iterate next value because the next() method did not return an object, but ${type(
                  iterResult
                )}.`
              );
            }

            if (iterResult.done) {
              return { done: true, value: undefined };
            }

            const iterValue = converter(
              iterResult.value,
              `${context} failed to iterate next value`,
              `The value returned from the next() method`,
              opts
            );

            return { done: false, value: iterValue };
          },
          async return(reason?: any) {
            if (asyncIterator.return === undefined) {
              return { value: undefined, done: true };
            }

            // eslint-disable-next-line no-restricted-syntax
            const returnPromiseResult = await asyncIterator.return(reason);
            if (type(returnPromiseResult) !== "Object") {
              throw TypeError(
                `${context} failed to close iterator because the return() method did not return an object, but ${type(
                  returnPromiseResult
                )}.`
              );
            }

            return { value: undefined, done: true };
          },
          [primordials.SymbolAsyncIterator]() {
            return this;
          },
        };
      },
    };
  };
}

function createRecordConverter<K extends string | number | symbol, V>(
  keyConverter: (v: any, prefix?: string, context?: string, opts?: any) => K,
  valueConverter: (v: any, prefix?: string, context?: string, opts?: any) => V
): (v: any, prefix?: string, context?: string, opts?: any) => Record<K, V> {
  return (V, prefix, context, opts) => {
    if (type(V) !== "Object") {
      throw makeException(
        TypeError,
        "can not be converted to dictionary",
        prefix,
        context
      );
    }
    const result = ObjectCreate(null);
    /*// Fast path for common case (not a Proxy)
    // eslint-disable-next-line no-constant-condition
    if (!core.isProxy(V)) {
      for (const key in V) {
        if (!ObjectHasOwn(V, key)) {
          continue;
        }
        const typedKey = keyConverter(key, prefix, context, opts);
        const value = V[key];
        const typedValue = valueConverter(value, prefix, context, opts);
        result[typedKey] = typedValue;
      }
      return result;
    }*/
    // Slow path if Proxy (e.g: in WPT tests)
    const keys = ReflectOwnKeys(V);
    for (let i = 0; i < keys.length; ++i) {
      const key = keys[i]!;
      const desc = ObjectGetOwnPropertyDescriptor(V, key);
      if (desc !== undefined && desc.enumerable === true) {
        const typedKey = keyConverter(key, prefix, context, opts);
        const value = V[key];
        const typedValue = valueConverter(value, prefix, context, opts);
        result[typedKey] = typedValue;
      }
    }
    return result;
  };
}

function createPromiseConverter<T>(
  converter: (v: any, prefix?: string, context?: string, opts?: any) => T
): (
  v: any,
  prefix?: string,
  context?: string,
  opts?: any
) => primordials.Promise<T> {
  return (V, prefix, context, opts) =>
    // should be able to handle thenables
    // see: https://github.com/web-platform-tests/wpt/blob/a31d3ba53a79412793642366f3816c9a63f0cf57/streams/writable-streams/close.any.js#L207
    typeof V?.then === "function"
      ? (PromisePrototypeThen(PromiseResolve(V), (V) =>
          converter(V, prefix, context, opts)
        ) satisfies primordials.Promise<unknown> as primordials.Promise<T>)
      : PromiseResolve(converter(V, prefix, context, opts));
}

function invokeCallbackFunction<T>(
  callable: (...args: any) => any,
  args: any[],
  thisArg: any,
  returnValueConverter: (
    v: any,
    prefix?: string,
    context?: string,
    opts?: any
  ) => T,
  prefix: string,
  returnsPromise?: boolean
): T {
  try {
    const rv = ReflectApply(callable, thisArg, args);
    return returnValueConverter(rv, prefix, "return value");
  } catch (err) {
    if (returnsPromise === true) {
      return PromiseReject(err) as T;
    }
    throw err;
  }
}

const brand = Symbol("[[webidl.brand]]");

function createInterfaceConverter<C>(
  name: string,
  prototype: C
): (v: any, prefix?: string, context?: string, opts?: any) => C {
  return (V, prefix, context, _opts) => {
    if (!ObjectPrototypeIsPrototypeOf(prototype, V) || V[brand] !== brand) {
      throw makeException(TypeError, `is not of type ${name}`, prefix, context);
    }
    return V;
  };
}

function brandInstance(self: any) {
  self[brand] = brand;
}

function assertBranded<C>(self: unknown, prototype: C): asserts self is C {
  if (
    typeof self !== "object" ||
    self === null ||
    !ObjectPrototypeIsPrototypeOf(prototype, self) ||
    (self as any)[brand] !== brand
  ) {
    throw new TypeError("Illegal invocation");
  }
}

function illegalConstructor() {
  throw new TypeError("Illegal constructor");
}

function define(target: object, source: object) {
  const keys = ReflectOwnKeys(source);
  for (let i = 0; i < keys.length; ++i) {
    const key = keys[i]!;
    const descriptor = ReflectGetOwnPropertyDescriptor(source, key);
    if (descriptor && !ReflectDefineProperty(target, key, descriptor)) {
      throw new TypeError(`Cannot redefine property: ${String(key)}`);
    }
  }
}

const _iteratorInternal = Symbol("iterator internal");

const globalIteratorPrototype = ObjectGetPrototypeOf(ArrayIteratorPrototype);

function mixinPairIterable<
  T extends { new (...args: any): any; prototype: any },
  KK extends PropertyKey,
  VK extends PropertyKey
>(
  name: string,
  prototype: T,
  safe_dataMap: primordialUtils.SafeWeakMap<
    InstanceType<T>,
    (Record<KK, any> & Record<VK, any>)[]
  >,
  keyKey: KK,
  valueKey: VK
): void {
  const iteratorPrototype = ObjectCreate(globalIteratorPrototype, {
    [primordials.SymbolToStringTag]: {
      configurable: true,
      value: `${name} Iterator`,
    },
  });
  define(iteratorPrototype, {
    next() {
      const internal = this && (this as any)[_iteratorInternal];
      if (!internal) {
        throw new TypeError(
          `next() called on a value that is not a ${name} iterator object`
        );
      }
      const { target, kind, index } = internal;
      const values = safe_dataMap.get(target)!;
      const len = values.length;
      if (index >= len) {
        return { value: undefined, done: true };
      }
      const pair = values[index]!;
      internal.index = index + 1;
      let result;
      switch (kind) {
        case "key":
          result = pair[keyKey];
          break;
        case "value":
          result = pair[valueKey];
          break;
        case "key+value":
          result = [pair[keyKey], pair[valueKey]];
          break;
      }
      return { value: result, done: false };
    },
  });
  function createDefaultIterator(target: any, kind: any) {
    const iterator = ObjectCreate(iteratorPrototype);
    ObjectDefineProperty(iterator, _iteratorInternal, {
      __proto__: null,
      value: { target, kind, index: 0 },
      configurable: true,
    });
    return iterator;
  }

  function entries(this: any) {
    assertBranded(this, prototype.prototype);
    return createDefaultIterator(this, "key+value");
  }

  const properties = {
    entries: {
      value: entries,
      writable: true,
      enumerable: true,
      configurable: true,
    },
    [primordials.SymbolIterator]: {
      value: entries,
      writable: true,
      enumerable: false,
      configurable: true,
    },
    keys: {
      value: function keys() {
        assertBranded(this, prototype.prototype);
        return createDefaultIterator(this, "key");
      },
      writable: true,
      enumerable: true,
      configurable: true,
    },
    values: {
      value: function values() {
        assertBranded(this, prototype.prototype);
        return createDefaultIterator(this, "value");
      },
      writable: true,
      enumerable: true,
      configurable: true,
    },
    forEach: {
      value: function forEach(idlCallback: unknown, thisArg = undefined) {
        assertBranded(this, prototype.prototype);
        const prefix = `Failed to execute 'forEach' on '${name}'`;
        requiredArguments(arguments.length, 1, prefix);
        let parsedIdlCallback = safe_converters["Function"](
          idlCallback,
          prefix,
          "Argument 1"
        );
        parsedIdlCallback = FunctionPrototypeBind(
          parsedIdlCallback,
          thisArg ?? globalThis
        );
        const pairs = safe_dataMap.get(this as any)!;
        for (let i = 0; i < pairs.length; i++) {
          const entry = pairs[i]!;
          parsedIdlCallback(entry[valueKey], entry[keyKey], this);
        }
      },
      writable: true,
      enumerable: true,
      configurable: true,
    },
  };
  return ObjectDefineProperties(prototype.prototype, properties);
}

function configureInterface(interface_: any) {
  configureProperties(interface_);
  configureProperties(interface_.prototype);
  ObjectDefineProperty(interface_.prototype, primordials.SymbolToStringTag, {
    __proto__: null,
    value: interface_.name,
    enumerable: false,
    configurable: true,
    writable: false,
  });
}

function configureProperties(obj: any) {
  const descriptors = ObjectGetOwnPropertyDescriptors(obj);
  for (const key in descriptors) {
    if (!ObjectHasOwn(descriptors, key)) {
      continue;
    }
    if (key === "constructor") continue;
    if (key === "prototype") continue;
    const descriptor = descriptors[key]!;
    if (
      ReflectHas(descriptor, "value") &&
      typeof descriptor.value === "function"
    ) {
      ObjectDefineProperty(obj, key, {
        __proto__: null,
        enumerable: true,
        writable: true,
        configurable: true,
      });
    } else if (ReflectHas(descriptor, "get")) {
      ObjectDefineProperty(obj, key, {
        __proto__: null,
        enumerable: true,
        configurable: true,
      });
    }
  }
}

const setlikeInner = Symbol("[[set]]");

// Ref: https://webidl.spec.whatwg.org/#es-setlike
function setlike(obj: any, objPrototype: any, readonly: boolean) {
  ObjectDefineProperties(obj, {
    size: {
      __proto__: null,
      configurable: true,
      enumerable: true,
      get() {
        assertBranded(this, objPrototype);
        return obj[setlikeInner].size;
      },
    },
    [primordials.SymbolIterator]: {
      __proto__: null,
      configurable: true,
      enumerable: false,
      writable: true,
      value() {
        assertBranded(this, objPrototype);
        // eslint-disable-next-line no-restricted-syntax
        return obj[setlikeInner][primordials.SymbolIterator]();
      },
    },
    entries: {
      __proto__: null,
      configurable: true,
      enumerable: true,
      writable: true,
      value() {
        assertBranded(this, objPrototype);
        return SetPrototypeEntries(obj[setlikeInner]);
      },
    },
    keys: {
      __proto__: null,
      configurable: true,
      enumerable: true,
      writable: true,
      value() {
        assertBranded(this, objPrototype);
        return SetPrototypeKeys(obj[setlikeInner]);
      },
    },
    values: {
      __proto__: null,
      configurable: true,
      enumerable: true,
      writable: true,
      value() {
        assertBranded(this, objPrototype);
        return SetPrototypeValues(obj[setlikeInner]);
      },
    },
    forEach: {
      __proto__: null,
      configurable: true,
      enumerable: true,
      writable: true,
      value(
        callbackfn: (
          value: any,
          value2: any,
          set: primordials.Set<any>
        ) => void,
        thisArg?: any
      ) {
        assertBranded(this, objPrototype);
        return SetPrototypeForEach(obj[setlikeInner], callbackfn, thisArg);
      },
    },
    has: {
      __proto__: null,
      configurable: true,
      enumerable: true,
      writable: true,
      value(value: unknown) {
        assertBranded(this, objPrototype);
        return SetPrototypeHas(obj[setlikeInner], value);
      },
    },
  });

  if (!readonly) {
    ObjectDefineProperties(obj, {
      add: {
        __proto__: null,
        configurable: true,
        enumerable: true,
        writable: true,
        value(value: unknown) {
          assertBranded(this, objPrototype);
          return SetPrototypeAdd(obj[setlikeInner], value);
        },
      },
      delete: {
        __proto__: null,
        configurable: true,
        enumerable: true,
        writable: true,
        value(value: unknown) {
          assertBranded(this, objPrototype);
          return SetPrototypeDelete(obj[setlikeInner], value);
        },
      },
      clear: {
        __proto__: null,
        configurable: true,
        enumerable: true,
        writable: true,
        value() {
          assertBranded(this, objPrototype);
          return SetPrototypeClear(obj[setlikeInner]);
        },
      },
    });
  }
}

export {
  assertBranded,
  configureInterface,
  safe_converters as converters,
  createAsyncIterableConverter,
  brandInstance,
  createDictionaryConverter,
  createEnumConverter,
  createInterfaceConverter,
  createNullableConverter,
  createPromiseConverter,
  createRecordConverter,
  createSequenceConverter,
  illegalConstructor,
  invokeCallbackFunction,
  isAsyncIterable,
  makeException,
  mixinPairIterable,
  requiredArguments,
  setlike,
  setlikeInner,
  type,
};
