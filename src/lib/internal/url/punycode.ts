import { primordials, primordialUtils } from "emjs:internal/internals";

const {
  MathFloor: floor,
  StringFromCharCode: stringFromCharCode,
  RangeError,
  StringFromCodePoint,
  StringPrototypeCharCodeAt,
  ArrayPrototypeJoin,
  ArrayPrototypePush,
  StringPrototypeLastIndexOf,
  ArrayPrototypeSplice,
} = primordials;
const { SafeArrayIterator } = primordialUtils;

/** Highest positive signed 32-bit float value */
const maxInt = 2147483647; // aka. 0x7FFFFFFF or 2^31-1

/** Bootstring parameters */
const base = 36;
const tMin = 1;
const tMax = 26;
const skew = 38;
const damp = 700;
const initialBias = 72;
const initialN = 128; // 0x80
const delimiter = "-"; // '\x2D'

/** Error messages */
const errors = {
  __proto__: null,
  overflow: "Overflow: input needs wider integers to process",
  "not-basic": "Illegal input >= 0x80 (not a basic code point)",
  "invalid-input": "Invalid input",
};

/** Convenience shortcuts */
const baseMinusTMin = base - tMin;

/*--------------------------------------------------------------------------*/

/**
 * A generic error utility function.
 * @private
 */
function error(type: "overflow" | "not-basic" | "invalid-input") {
  throw new RangeError(errors[type]);
}

/**
 * Creates an array containing the numeric code points of each Unicode
 * character in the string. While JavaScript uses UCS-2 internally,
 * this function will convert a pair of surrogate halves (each of which
 * UCS-2 exposes as separate characters) into a single code point,
 * matching UTF-16.
 * @see `punycode.ucs2.encode`
 * @see <https://mathiasbynens.be/notes/javascript-encoding>
 * @memberOf punycode.ucs2
 * @name decode
 */
function ucs2decode(string: string) {
  const output: number[] = [];
  let counter = 0;
  const length = string.length;
  while (counter < length) {
    const value = StringPrototypeCharCodeAt(string, counter++);
    if (value >= 0xd800 && value <= 0xdbff && counter < length) {
      // It's a high surrogate, and there is a next character.
      const extra = StringPrototypeCharCodeAt(string, counter++);
      if ((extra & 0xfc00) == 0xdc00) {
        // Low surrogate.
        ArrayPrototypePush(
          output,
          ((value & 0x3ff) << 10) + (extra & 0x3ff) + 0x10000
        );
      } else {
        // It's an unmatched surrogate; only append this code unit, in case the
        // next code unit is the high surrogate of a surrogate pair.
        ArrayPrototypePush(output, value);
        counter--;
      }
    } else {
      ArrayPrototypePush(output, value);
    }
  }
  return output;
}

/**
 * Converts a basic code point into a digit/integer.
 * @see `digitToBasic()`
 * @private
 * @param {Number} codePoint The basic numeric code point value.
 * @returns {Number} The numeric value of a basic code point (for use in
 * representing integers) in the range `0` to `base - 1`, or `base` if
 * the code point does not represent a value.
 */
const basicToDigit = function (codePoint: number) {
  if (codePoint >= 0x30 && codePoint < 0x3a) {
    return 26 + (codePoint - 0x30);
  }
  if (codePoint >= 0x41 && codePoint < 0x5b) {
    return codePoint - 0x41;
  }
  if (codePoint >= 0x61 && codePoint < 0x7b) {
    return codePoint - 0x61;
  }
  return base;
};

/**
 * Converts a digit/integer into a basic code point.
 * @see `basicToDigit()`
 * @private
 * @param {Number} digit The numeric value of a basic code point.
 * @returns {Number} The basic code point whose value (when used for
 * representing integers) is `digit`, which needs to be in the range
 * `0` to `base - 1`. If `flag` is non-zero, the uppercase form is
 * used; else, the lowercase form is used. The behavior is undefined
 * if `flag` is non-zero and `digit` has no uppercase form.
 */
const digitToBasic = function (digit: number, flag: number) {
  //  0..25 map to ASCII a..z or A..Z
  // 26..35 map to ASCII 0..9
  return digit + 22 + 75 * +(digit < 26) - (+(flag != 0) << 5);
};

/**
 * Bias adaptation function as per section 3.4 of RFC 3492.
 * https://tools.ietf.org/html/rfc3492#section-3.4
 * @private
 */
const adapt = function (delta: number, numPoints: number, firstTime: boolean) {
  let k = 0;
  delta = firstTime ? floor(delta / damp) : delta >> 1;
  delta += floor(delta / numPoints);
  for (
    ;
    /* no initialization */ delta > (baseMinusTMin * tMax) >> 1;
    k += base
  ) {
    delta = floor(delta / baseMinusTMin);
  }
  return floor(k + ((baseMinusTMin + 1) * delta) / (delta + skew));
};

/**
 * Converts a Punycode string of ASCII-only symbols to a string of Unicode
 * symbols.
 * @memberOf punycode
 * @param {String} input The Punycode string of ASCII-only symbols.
 * @returns {String} The resulting string of Unicode symbols.
 */
export const punycodeDecode = function (input: string) {
  // Don't use UCS-2.
  const output: number[] = [];
  const inputLength = input.length;
  let i = 0;
  let n = initialN;
  let bias = initialBias;

  // Handle the basic code points: let `basic` be the number of input code
  // points before the last delimiter, or `0` if there is none, then copy
  // the first basic code points to the output.

  let basic = StringPrototypeLastIndexOf(input, delimiter);
  if (basic < 0) {
    basic = 0;
  }

  for (let j = 0; j < basic; ++j) {
    // if it's not a basic code point
    if (StringPrototypeCharCodeAt(input, j) >= 0x80) {
      error("not-basic");
    }
    ArrayPrototypePush(output, StringPrototypeCharCodeAt(input, j));
  }

  // Main decoding loop: start just after the last delimiter if any basic code
  // points were copied; start at the beginning otherwise.

  for (
    let index = basic > 0 ? basic + 1 : 0;
    index < inputLength /* no final expression */;

  ) {
    // `index` is the index of the next character to be consumed.
    // Decode a generalized variable-length integer into `delta`,
    // which gets added to `i`. The overflow checking is easier
    // if we increase `i` as we go, then subtract off its starting
    // value at the end to obtain `delta`.
    const oldi = i;
    for (let w = 1, k = base /* no condition */; ; k += base) {
      if (index >= inputLength) {
        error("invalid-input");
      }

      const digit = basicToDigit(StringPrototypeCharCodeAt(input, index++));

      if (digit >= base) {
        error("invalid-input");
      }
      if (digit > floor((maxInt - i) / w)) {
        error("overflow");
      }

      i += digit * w;
      const t = k <= bias ? tMin : k >= bias + tMax ? tMax : k - bias;

      if (digit < t) {
        break;
      }

      const baseMinusT = base - t;
      if (w > floor(maxInt / baseMinusT)) {
        error("overflow");
      }

      w *= baseMinusT;
    }

    const out = output.length + 1;
    bias = adapt(i - oldi, out, oldi == 0);

    // `i` was supposed to wrap around from `out` to `0`,
    // incrementing `n` each time, so we'll fix that now:
    if (floor(i / out) > maxInt - n) {
      error("overflow");
    }

    n += floor(i / out);
    i %= out;

    // Insert `n` at position `i` of the output.
    ArrayPrototypeSplice(output, i++, 0, n);
  }

  return StringFromCodePoint(...new SafeArrayIterator(output));
};

/**
 * Converts a string of Unicode symbols (e.g. a domain name label) to a
 * Punycode string of ASCII-only symbols.
 * @memberOf punycode
 * @param {String} input The string of Unicode symbols.
 * @returns {String} The resulting Punycode string of ASCII-only symbols.
 */
export const punycodeEncode = function (inputStr: string) {
  const output: string[] = [];

  // Convert the input in UCS-2 to an array of Unicode code points.
  const input = ucs2decode(inputStr);

  // Cache the length.
  const inputLength = input.length;

  // Initialize the state.
  let n = initialN;
  let delta = 0;
  let bias = initialBias;

  // Handle the basic code points.
  for (const currentValue of input) {
    if (currentValue < 0x80) {
      ArrayPrototypePush(output, stringFromCharCode(currentValue));
    }
  }

  const basicLength = output.length;
  let handledCPCount = basicLength;

  // `handledCPCount` is the number of code points that have been handled;
  // `basicLength` is the number of basic code points.

  // Finish the basic string with a delimiter unless it's empty.
  if (basicLength) {
    ArrayPrototypePush(output, delimiter);
  }

  // Main encoding loop:
  while (handledCPCount < inputLength) {
    // All non-basic code points < n have been handled already. Find the next
    // larger one:
    let m = maxInt;
    for (const currentValue of input) {
      if (currentValue >= n && currentValue < m) {
        m = currentValue;
      }
    }

    // Increase `delta` enough to advance the decoder's <n,i> state to <m,0>,
    // but guard against overflow.
    const handledCPCountPlusOne = handledCPCount + 1;
    if (m - n > floor((maxInt - delta) / handledCPCountPlusOne)) {
      error("overflow");
    }

    delta += (m - n) * handledCPCountPlusOne;
    n = m;

    for (const currentValue of input) {
      if (currentValue < n && ++delta > maxInt) {
        error("overflow");
      }
      if (currentValue === n) {
        // Represent delta as a generalized variable-length integer.
        let q = delta;
        for (let k = base /* no condition */; ; k += base) {
          const t = k <= bias ? tMin : k >= bias + tMax ? tMax : k - bias;
          if (q < t) {
            break;
          }
          const qMinusT = q - t;
          const baseMinusT = base - t;
          ArrayPrototypePush(
            output,
            stringFromCharCode(digitToBasic(t + (qMinusT % baseMinusT), 0))
          );
          q = floor(qMinusT / baseMinusT);
        }

        ArrayPrototypePush(output, stringFromCharCode(digitToBasic(q, 0)));
        bias = adapt(
          delta,
          handledCPCountPlusOne,
          handledCPCount === basicLength
        );
        delta = 0;
        ++handledCPCount;
      }
    }

    ++delta;
    ++n;
  }
  return ArrayPrototypeJoin(output, "");
};
