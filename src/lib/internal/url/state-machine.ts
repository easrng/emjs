/* eslint-disable no-control-regex */
// https://github.com/jsdom/whatwg-url/blob/807353d966f73cdf62f852230b699bbf5c9cefca/lib/url-state-machine.js

import { toASCII as tr46_toASCII } from "emjs:internal/url/tr46";
import {
  isASCIIAlpha,
  isASCIIAlphanumeric,
  isASCIIDigit,
  isASCIIHex,
} from "emjs:internal/url/infra";
import { utf8DecodeWithoutBOM } from "emjs:internal/encoding";
import {
  percentDecodeString,
  utf8PercentEncodeCodePoint,
  utf8PercentEncodeString,
  isC0ControlPercentEncode,
  isFragmentPercentEncode,
  isQueryPercentEncode,
  isSpecialQueryPercentEncode,
  isPathPercentEncode,
  isUserinfoPercentEncode,
} from "emjs:internal/url/percent-encoding";
import { primordials, primordialUtils } from "emjs:internal/internals";

const { SafeStringIterator, SafeSet } = primordialUtils;
const {
  StringFromCodePoint,
  isNaN,
  StringPrototypeCodePointAt,
  Symbol,
  StringPrototypeToLowerCase,
  RegExpPrototypeSymbolSearch,
  ArrayFrom,
  String,
  MathFloor,
  StringPrototypeCharAt,
  Array,
  ArrayPrototypePop,
  ArrayPrototypePush,
  ArrayPrototypeSlice,
  NumberParseInt,
  NumberPrototypeToString,
  RegExpPrototypeSymbolReplace,
  RegExpPrototypeTest,
  StringPrototypeSlice,
  StringPrototypeSplit,
} = primordials;

function p(char: string) {
  return StringPrototypeCodePointAt(char, 0);
}

const specialSchemes: Record<string, number | null> = {
  ftp: 21,
  file: null,
  http: 80,
  https: 443,
  ws: 80,
  wss: 443,
};

const failure: unique symbol = Symbol("failure") as never;

function countSymbols(str: string) {
  return [...new SafeStringIterator(str)].length;
}

function at(input: number[], idx: number) {
  const c = input[idx]!;
  return isNaN(c) ? undefined : StringFromCodePoint(c);
}

function isSingleDot(buffer: string) {
  return buffer === "." || StringPrototypeToLowerCase(buffer) === "%2e";
}

function isDoubleDot(buffer: string) {
  buffer = StringPrototypeToLowerCase(buffer);
  return (
    buffer === ".." ||
    buffer === "%2e." ||
    buffer === ".%2e" ||
    buffer === "%2e%2e"
  );
}

function isWindowsDriveLetterCodePoints(cp1: number, cp2: number) {
  return isASCIIAlpha(cp1) && (cp2 === p(":") || cp2 === p("|"));
}

function isWindowsDriveLetterString(string: string) {
  return (
    string.length === 2 &&
    isASCIIAlpha(StringPrototypeCodePointAt(string, 0)!) &&
    (string[1] === ":" || string[1] === "|")
  );
}

function isNormalizedWindowsDriveLetterString(string: string) {
  return (
    string.length === 2 &&
    isASCIIAlpha(StringPrototypeCodePointAt(string, 0)!) &&
    string[1] === ":"
  );
}

function containsForbiddenHostCodePoint(string: string) {
  return (
    RegExpPrototypeSymbolSearch(
      /\u0000|\u0009|\u000A|\u000D|\u0020|#|\/|:|<|>|\?|@|\[|\\|\]|\^|\|/u,
      string
    ) !== -1
  );
}

function containsForbiddenDomainCodePoint(string: string) {
  return (
    containsForbiddenHostCodePoint(string) ||
    RegExpPrototypeSymbolSearch(/[\u0000-\u001F]|%|\u007F/u, string) !== -1
  );
}

function isSpecialScheme(scheme: string) {
  return specialSchemes[scheme] !== undefined;
}

function isSpecial(url: URLRecord) {
  return isSpecialScheme(url.scheme);
}

function isNotSpecial(url: URLRecord) {
  return !isSpecialScheme(url.scheme);
}

function defaultPort(scheme: string) {
  return specialSchemes[scheme];
}

function parseIPv4Number(input: string) {
  if (input === "") {
    return failure;
  }

  let R = 10;

  if (
    input.length >= 2 &&
    StringPrototypeCharAt(input, 0) === "0" &&
    StringPrototypeToLowerCase(StringPrototypeCharAt(input, 1)) === "x"
  ) {
    input = StringPrototypeSlice(input, 2);
    R = 16;
  } else if (input.length >= 2 && StringPrototypeCharAt(input, 0) === "0") {
    input = StringPrototypeSlice(input, 1);
    R = 8;
  }

  if (input === "") {
    return 0;
  }

  let regex = /[^0-7]/u;
  if (R === 10) {
    regex = /[^0-9]/u;
  }
  if (R === 16) {
    regex = /[^0-9A-Fa-f]/u;
  }

  if (RegExpPrototypeTest(regex, input)) {
    return failure;
  }

  return NumberParseInt(input, R);
}

function parseIPv4(input: string) {
  const parts = StringPrototypeSplit(input, ".");
  if (parts[parts.length - 1] === "") {
    if (parts.length > 1) {
      ArrayPrototypePop(parts);
    }
  }

  if (parts.length > 4) {
    return failure;
  }

  const numbers: number[] = [];
  for (const part of parts) {
    const n = parseIPv4Number(part);
    if (n === failure) {
      return failure;
    }

    ArrayPrototypePush(numbers, n);
  }

  for (let i = 0; i < numbers.length - 1; ++i) {
    if (numbers[i]! > 255) {
      return failure;
    }
  }
  if (numbers[numbers.length - 1]! >= 256 ** (5 - numbers.length)) {
    return failure;
  }

  let ipv4 = ArrayPrototypePop(numbers)!;
  let counter = 0;

  for (const n of numbers) {
    ipv4 += n * 256 ** (3 - counter);
    ++counter;
  }

  return ipv4;
}

function serializeIPv4(address: number) {
  let output = "";
  let n = address;

  for (let i = 1; i <= 4; ++i) {
    output = String(n % 256) + output;
    if (i !== 4) {
      output = `.${output}`;
    }
    n = MathFloor(n / 256);
  }

  return output;
}

function parseIPv6(rawInput: string) {
  const address = [0, 0, 0, 0, 0, 0, 0, 0];
  let pieceIndex = 0;
  let compress = null;
  let pointer = 0;

  const input = ArrayFrom(rawInput, (c) => StringPrototypeCodePointAt(c, 0)!);

  if (input[pointer] === p(":")) {
    if (input[pointer + 1] !== p(":")) {
      return failure;
    }

    pointer += 2;
    ++pieceIndex;
    compress = pieceIndex;
  }

  while (pointer < input.length) {
    if (pieceIndex === 8) {
      return failure;
    }

    if (input[pointer] === p(":")) {
      if (compress !== null) {
        return failure;
      }
      ++pointer;
      ++pieceIndex;
      compress = pieceIndex;
      continue;
    }

    let value = 0;
    let length = 0;

    while (length < 4 && isASCIIHex(input[pointer]!)) {
      value = value * 0x10 + NumberParseInt(at(input, pointer)!, 16);
      ++pointer;
      ++length;
    }

    if (input[pointer] === p(".")) {
      if (length === 0) {
        return failure;
      }

      pointer -= length;

      if (pieceIndex > 6) {
        return failure;
      }

      let numbersSeen = 0;

      while (input[pointer] !== undefined) {
        let ipv4Piece = null;

        if (numbersSeen > 0) {
          if (input[pointer] === p(".") && numbersSeen < 4) {
            ++pointer;
          } else {
            return failure;
          }
        }

        if (!isASCIIDigit(input[pointer]!)) {
          return failure;
        }

        while (isASCIIDigit(input[pointer]!)) {
          const number = NumberParseInt(at(input, pointer)!);
          if (ipv4Piece === null) {
            ipv4Piece = number;
          } else if (ipv4Piece === 0) {
            return failure;
          } else {
            ipv4Piece = ipv4Piece * 10 + number;
          }
          if (ipv4Piece > 255) {
            return failure;
          }
          ++pointer;
        }

        address[pieceIndex] = address[pieceIndex]! * 0x100 + ipv4Piece!;

        ++numbersSeen;

        if (numbersSeen === 2 || numbersSeen === 4) {
          ++pieceIndex;
        }
      }

      if (numbersSeen !== 4) {
        return failure;
      }

      break;
    } else if (input[pointer] === p(":")) {
      ++pointer;
      if (input[pointer] === undefined) {
        return failure;
      }
    } else if (input[pointer] !== undefined) {
      return failure;
    }

    address[pieceIndex] = value;
    ++pieceIndex;
  }

  if (compress !== null) {
    let swaps = pieceIndex - compress;
    pieceIndex = 7;
    while (pieceIndex !== 0 && swaps > 0) {
      const temp = address[compress + swaps - 1]!;
      address[compress + swaps - 1] = address[pieceIndex]!;
      address[pieceIndex] = temp;
      --pieceIndex;
      --swaps;
    }
  } else if (compress === null && pieceIndex !== 8) {
    return failure;
  }

  return address;
}

function serializeIPv6(address: number[]) {
  let output = "";
  const compress = findTheIPv6AddressCompressedPieceIndex(address);
  let ignore0 = false;

  for (let pieceIndex = 0; pieceIndex <= 7; ++pieceIndex) {
    if (ignore0 && address[pieceIndex] === 0) {
      continue;
    } else if (ignore0) {
      ignore0 = false;
    }

    if (compress === pieceIndex) {
      const separator = pieceIndex === 0 ? "::" : ":";
      output += separator;
      ignore0 = true;
      continue;
    }

    output += NumberPrototypeToString(address[pieceIndex]!, 16);

    if (pieceIndex !== 7) {
      output += ":";
    }
  }

  return output;
}

function parseHost(input: string, isOpaque = false) {
  if (input[0] === "[") {
    if (input[input.length - 1] !== "]") {
      return failure;
    }

    return parseIPv6(StringPrototypeSlice(input, 1, input.length - 1));
  }

  if (isOpaque) {
    return parseOpaqueHost(input);
  }

  const domain = utf8DecodeWithoutBOM(percentDecodeString(input));
  const asciiDomain = domainToASCII(domain);
  if (asciiDomain === failure) {
    return failure;
  }

  if (containsForbiddenDomainCodePoint(asciiDomain)) {
    return failure;
  }

  if (endsInANumber(asciiDomain)) {
    return parseIPv4(asciiDomain);
  }

  return asciiDomain;
}

function endsInANumber(input: string) {
  const parts = StringPrototypeSplit(input, ".");
  if (parts[parts.length - 1] === "") {
    if (parts.length === 1) {
      return false;
    }
    ArrayPrototypePop(parts);
  }

  const last = parts[parts.length - 1]!;
  if (parseIPv4Number(last) !== failure) {
    return true;
  }

  if (RegExpPrototypeTest(/^[0-9]+$/u, last)) {
    return true;
  }

  return false;
}

function parseOpaqueHost(input: string) {
  if (containsForbiddenHostCodePoint(input)) {
    return failure;
  }

  return utf8PercentEncodeString(input, isC0ControlPercentEncode);
}

function findTheIPv6AddressCompressedPieceIndex(address: number[]) {
  let longestIndex = null;
  let longestSize = 1; // only find elements > 1
  let foundIndex = null;
  let foundSize = 0;

  for (let pieceIndex = 0; pieceIndex < address.length; ++pieceIndex) {
    if (address[pieceIndex] !== 0) {
      if (foundSize > longestSize) {
        longestIndex = foundIndex;
        longestSize = foundSize;
      }

      foundIndex = null;
      foundSize = 0;
    } else {
      if (foundIndex === null) {
        foundIndex = pieceIndex;
      }
      ++foundSize;
    }
  }

  if (foundSize > longestSize) {
    return foundIndex;
  }

  return longestIndex;
}

export function serializeHost(host: string | number | number[] | null) {
  if (typeof host === "number") {
    return serializeIPv4(host);
  }

  // IPv6 serializer
  if (host instanceof Array) {
    return `[${serializeIPv6(host)}]`;
  }

  return host;
}

function domainToASCII(domain: string, beStrict = false) {
  const result = tr46_toASCII(domain, {
    checkBidi: true,
    checkHyphens: false,
    checkJoiners: true,
    useSTD3ASCIIRules: beStrict,
    verifyDNSLength: beStrict,
  });
  if (result === null || result === "") {
    return failure;
  }
  return result;
}

function trimControlChars(url: string) {
  return RegExpPrototypeSymbolReplace(
    /^[\u0000-\u001F\u0020]+|[\u0000-\u001F\u0020]+$/gu,
    url,
    ""
  );
}

function trimTabAndNewline(url: string) {
  return RegExpPrototypeSymbolReplace(/\u0009|\u000A|\u000D/gu, url, "");
}

function shortenPath(url: URLRecord & { path: string[] }) {
  const { path } = url;
  if (path.length === 0) {
    return;
  }
  if (
    url.scheme === "file" &&
    path.length === 1 &&
    isNormalizedWindowsDriveLetter(path[0]!)
  ) {
    return;
  }

  ArrayPrototypePop(path);
}

function includesCredentials(url: URLRecord) {
  return url.username !== "" || url.password !== "";
}

export function cannotHaveAUsernamePasswordPort(url: URLRecord) {
  return url.host === null || url.host === "" || url.scheme === "file";
}

export function hasAnOpaquePath(
  url: URLRecord
): url is URLRecord & { path: string } {
  return typeof url.path === "string";
}

function isNormalizedWindowsDriveLetter(string: string) {
  return RegExpPrototypeTest(/^[A-Za-z]:$/u, string);
}

export interface URLRecord {
  scheme: string;
  username: string;
  password: string;
  host: string | number | number[] | null;
  port: number | null;
  path: string | string[];
  query: string | null;
  fragment: string | null;
}

interface USMState {
  pointer: number;
  input: number[];
  base: URLRecord | null;
  encodingOverride: string;
  stateOverride: string | null;
  url: URLRecord;
  failure: boolean;
  parseError: boolean;
  state: string;
  buffer: string;
  atFlag: boolean;
  arrFlag: boolean;
  passwordTokenSeenFlag: boolean;
}

function createURLStateMachine(
  input: string,
  base: URLRecord | null | undefined,
  encodingOverride: string | null | undefined,
  url: URLRecord | null | undefined,
  stateOverride: string | null | undefined
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sm: USMState = { __proto__: null } as any;
  sm.pointer = 0;
  sm.base = base || null;
  sm.encodingOverride = encodingOverride || "utf-8";
  sm.stateOverride = stateOverride ?? null;
  sm.failure = false;
  sm.parseError = false;

  if (url) {
    sm.url = url;
  } else {
    sm.url = {
      scheme: "",
      username: "",
      password: "",
      host: null,
      port: null,
      path: [],
      query: null,
      fragment: null,
    };

    const res = trimControlChars(input);
    if (res !== input) {
      sm.parseError = true;
    }
    input = res;
  }

  const res = trimTabAndNewline(input);
  if (res !== input) {
    sm.parseError = true;
  }
  input = res;

  sm.state = stateOverride || "scheme start";

  sm.buffer = "";
  sm.atFlag = false;
  sm.arrFlag = false;
  sm.passwordTokenSeenFlag = false;

  sm.input = ArrayFrom(input, (c) => StringPrototypeCodePointAt(c, 0)!);

  for (; sm.pointer <= sm.input.length; ++sm.pointer) {
    const c = sm.input[sm.pointer]!;
    const cStr = isNaN(c) ? undefined : StringFromCodePoint(c);

    // exec state machine
    const ret = safe_URLStateMachineSteps[`parse ${sm.state}`]!(sm, c, cStr);
    if (!ret) {
      break; // terminate algorithm
    } else if (ret === failure) {
      sm.failure = true;
      break;
    }
  }
  return sm;
}

const safe_URLStateMachineSteps: Record<
  string,
  (
    sm: USMState,
    c: number,
    cStr: string | undefined
  ) => boolean | typeof failure
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
> = { __proto__: null } as any;

safe_URLStateMachineSteps["parse scheme start"] = function parseSchemeStart(
  sm,
  c,
  cStr
) {
  if (isASCIIAlpha(c)) {
    sm.buffer += StringPrototypeToLowerCase(cStr!);
    sm.state = "scheme";
  } else if (!sm.stateOverride) {
    sm.state = "no scheme";
    --sm.pointer;
  } else {
    sm.parseError = true;
    return failure;
  }

  return true;
};

safe_URLStateMachineSteps["parse scheme"] = function parseScheme(sm, c, cStr) {
  if (isASCIIAlphanumeric(c) || c === p("+") || c === p("-") || c === p(".")) {
    sm.buffer += StringPrototypeToLowerCase(cStr!);
  } else if (c === p(":")) {
    if (sm.stateOverride) {
      if (isSpecial(sm.url) && !isSpecialScheme(sm.buffer)) {
        return false;
      }

      if (!isSpecial(sm.url) && isSpecialScheme(sm.buffer)) {
        return false;
      }

      if (
        (includesCredentials(sm.url) || sm.url.port !== null) &&
        sm.buffer === "file"
      ) {
        return false;
      }

      if (sm.url.scheme === "file" && sm.url.host === "") {
        return false;
      }
    }
    sm.url.scheme = sm.buffer;
    if (sm.stateOverride) {
      if (sm.url.port === defaultPort(sm.url.scheme)) {
        sm.url.port = null;
      }
      return false;
    }
    sm.buffer = "";
    if (sm.url.scheme === "file") {
      if (
        sm.input[sm.pointer + 1] !== p("/") ||
        sm.input[sm.pointer + 2] !== p("/")
      ) {
        sm.parseError = true;
      }
      sm.state = "file";
    } else if (
      isSpecial(sm.url) &&
      sm.base !== null &&
      sm.base.scheme === sm.url.scheme
    ) {
      sm.state = "special relative or authority";
    } else if (isSpecial(sm.url)) {
      sm.state = "special authority slashes";
    } else if (sm.input[sm.pointer + 1] === p("/")) {
      sm.state = "path or authority";
      ++sm.pointer;
    } else {
      sm.url.path = "";
      sm.state = "opaque path";
    }
  } else if (!sm.stateOverride) {
    sm.buffer = "";
    sm.state = "no scheme";
    sm.pointer = -1;
  } else {
    sm.parseError = true;
    return failure;
  }

  return true;
};

safe_URLStateMachineSteps["parse no scheme"] = function parseNoScheme(sm, c) {
  if (sm.base === null || (hasAnOpaquePath(sm.base) && c !== p("#"))) {
    return failure;
  } else if (hasAnOpaquePath(sm.base) && c === p("#")) {
    sm.url.scheme = sm.base.scheme;
    sm.url.path = sm.base.path;
    sm.url.query = sm.base.query;
    sm.url.fragment = "";
    sm.state = "fragment";
  } else if (sm.base.scheme === "file") {
    sm.state = "file";
    --sm.pointer;
  } else {
    sm.state = "relative";
    --sm.pointer;
  }

  return true;
};

safe_URLStateMachineSteps["parse special relative or authority"] =
  function parseSpecialRelativeOrAuthority(sm, c) {
    if (c === p("/") && sm.input[sm.pointer + 1] === p("/")) {
      sm.state = "special authority ignore slashes";
      ++sm.pointer;
    } else {
      sm.parseError = true;
      sm.state = "relative";
      --sm.pointer;
    }

    return true;
  };

safe_URLStateMachineSteps["parse path or authority"] =
  function parsePathOrAuthority(sm, c) {
    if (c === p("/")) {
      sm.state = "authority";
    } else {
      sm.state = "path";
      --sm.pointer;
    }

    return true;
  };

safe_URLStateMachineSteps["parse relative"] = function parseRelative(sm, c) {
  sm.url.scheme = sm.base!.scheme;
  if (c === p("/")) {
    sm.state = "relative slash";
  } else if (isSpecial(sm.url) && c === p("\\")) {
    sm.parseError = true;
    sm.state = "relative slash";
  } else {
    sm.url.username = sm.base!.username;
    sm.url.password = sm.base!.password;
    sm.url.host = sm.base!.host;
    sm.url.port = sm.base!.port;
    sm.url.path = ArrayPrototypeSlice(sm.base!.path);
    sm.url.query = sm.base!.query;
    if (c === p("?")) {
      sm.url.query = "";
      sm.state = "query";
    } else if (c === p("#")) {
      sm.url.fragment = "";
      sm.state = "fragment";
    } else if (!isNaN(c)) {
      sm.url.query = null;
      ArrayPrototypePop(sm.url.path as string[]);
      sm.state = "path";
      --sm.pointer;
    }
  }

  return true;
};

safe_URLStateMachineSteps["parse relative slash"] = function parseRelativeSlash(
  sm,
  c
) {
  if (isSpecial(sm.url) && (c === p("/") || c === p("\\"))) {
    if (c === p("\\")) {
      sm.parseError = true;
    }
    sm.state = "special authority ignore slashes";
  } else if (c === p("/")) {
    sm.state = "authority";
  } else {
    sm.url.username = sm.base!.username;
    sm.url.password = sm.base!.password;
    sm.url.host = sm.base!.host;
    sm.url.port = sm.base!.port;
    sm.state = "path";
    --sm.pointer;
  }

  return true;
};

safe_URLStateMachineSteps["parse special authority slashes"] =
  function parseSpecialAuthoritySlashes(sm, c) {
    if (c === p("/") && sm.input[sm.pointer + 1] === p("/")) {
      sm.state = "special authority ignore slashes";
      ++sm.pointer;
    } else {
      sm.parseError = true;
      sm.state = "special authority ignore slashes";
      --sm.pointer;
    }

    return true;
  };

safe_URLStateMachineSteps["parse special authority ignore slashes"] =
  function parseSpecialAuthorityIgnoreSlashes(sm, c) {
    if (c !== p("/") && c !== p("\\")) {
      sm.state = "authority";
      --sm.pointer;
    } else {
      sm.parseError = true;
    }

    return true;
  };

safe_URLStateMachineSteps["parse authority"] = function parseAuthority(
  sm,
  c,
  cStr
) {
  if (c === p("@")) {
    sm.parseError = true;
    if (sm.atFlag) {
      sm.buffer = `%40${sm.buffer}`;
    }
    sm.atFlag = true;

    // careful, this is based on buffer and has its own pointer (sm.pointer != pointer) and inner chars
    const len = countSymbols(sm.buffer);
    for (let pointer = 0; pointer < len; ++pointer) {
      const codePoint = StringPrototypeCodePointAt(sm.buffer, pointer)!;

      if (codePoint === p(":") && !sm.passwordTokenSeenFlag) {
        sm.passwordTokenSeenFlag = true;
        continue;
      }
      const encodedCodePoints = utf8PercentEncodeCodePoint(
        codePoint,
        isUserinfoPercentEncode
      );
      if (sm.passwordTokenSeenFlag) {
        sm.url.password += encodedCodePoints;
      } else {
        sm.url.username += encodedCodePoints;
      }
    }
    sm.buffer = "";
  } else if (
    isNaN(c) ||
    c === p("/") ||
    c === p("?") ||
    c === p("#") ||
    (isSpecial(sm.url) && c === p("\\"))
  ) {
    if (sm.atFlag && sm.buffer === "") {
      sm.parseError = true;
      return failure;
    }
    sm.pointer -= countSymbols(sm.buffer) + 1;
    sm.buffer = "";
    sm.state = "host";
  } else {
    sm.buffer += cStr;
  }

  return true;
};

safe_URLStateMachineSteps["parse hostname"] = safe_URLStateMachineSteps[
  "parse host"
] = function parseHostName(sm, c, cStr) {
  if (sm.stateOverride && sm.url.scheme === "file") {
    --sm.pointer;
    sm.state = "file host";
  } else if (c === p(":") && !sm.arrFlag) {
    if (sm.buffer === "") {
      sm.parseError = true;
      return failure;
    }

    if (sm.stateOverride === "hostname") {
      return false;
    }

    const host = parseHost(sm.buffer, isNotSpecial(sm.url));
    if (host === failure) {
      return failure;
    }

    sm.url.host = host;
    sm.buffer = "";
    sm.state = "port";
  } else if (
    isNaN(c) ||
    c === p("/") ||
    c === p("?") ||
    c === p("#") ||
    (isSpecial(sm.url) && c === p("\\"))
  ) {
    --sm.pointer;
    if (isSpecial(sm.url) && sm.buffer === "") {
      sm.parseError = true;
      return failure;
    } else if (
      sm.stateOverride &&
      sm.buffer === "" &&
      (includesCredentials(sm.url) || sm.url.port !== null)
    ) {
      sm.parseError = true;
      return false;
    }

    const host = parseHost(sm.buffer, isNotSpecial(sm.url));
    if (host === failure) {
      return failure;
    }

    sm.url.host = host;
    sm.buffer = "";
    sm.state = "path start";
    if (sm.stateOverride) {
      return false;
    }
  } else {
    if (c === p("[")) {
      sm.arrFlag = true;
    } else if (c === p("]")) {
      sm.arrFlag = false;
    }
    sm.buffer += cStr;
  }

  return true;
};

safe_URLStateMachineSteps["parse port"] = function parsePort(sm, c, cStr) {
  if (isASCIIDigit(c)) {
    sm.buffer += cStr;
  } else if (
    isNaN(c) ||
    c === p("/") ||
    c === p("?") ||
    c === p("#") ||
    (isSpecial(sm.url) && c === p("\\")) ||
    sm.stateOverride
  ) {
    if (sm.buffer !== "") {
      const port = NumberParseInt(sm.buffer);
      if (port > 2 ** 16 - 1) {
        sm.parseError = true;
        return failure;
      }
      sm.url.port = port === defaultPort(sm.url.scheme) ? null : port;
      sm.buffer = "";
    }
    if (sm.stateOverride) {
      return false;
    }
    sm.state = "path start";
    --sm.pointer;
  } else {
    sm.parseError = true;
    return failure;
  }

  return true;
};

const safe_fileOtherwiseCodePoints = new SafeSet([
  p("/"),
  p("\\"),
  p("?"),
  p("#"),
]);

function startsWithWindowsDriveLetter(input: number[], pointer: number) {
  const length = input.length - pointer;
  return (
    length >= 2 &&
    isWindowsDriveLetterCodePoints(input[pointer]!, input[pointer + 1]!) &&
    (length === 2 || safe_fileOtherwiseCodePoints.has(input[pointer + 2]))
  );
}

safe_URLStateMachineSteps["parse file"] = function parseFile(sm, c) {
  sm.url.scheme = "file";
  sm.url.host = "";

  if (c === p("/") || c === p("\\")) {
    if (c === p("\\")) {
      sm.parseError = true;
    }
    sm.state = "file slash";
  } else if (sm.base !== null && sm.base.scheme === "file") {
    sm.url.host = sm.base.host;
    sm.url.path = ArrayPrototypeSlice(sm.base.path);
    sm.url.query = sm.base.query;
    if (c === p("?")) {
      sm.url.query = "";
      sm.state = "query";
    } else if (c === p("#")) {
      sm.url.fragment = "";
      sm.state = "fragment";
    } else if (!isNaN(c)) {
      sm.url.query = null;
      if (!startsWithWindowsDriveLetter(sm.input, sm.pointer)) {
        shortenPath(
          sm.url satisfies URLRecord as URLRecord & { path: string[] }
        );
      } else {
        sm.parseError = true;
        sm.url.path = [];
      }

      sm.state = "path";
      --sm.pointer;
    }
  } else {
    sm.state = "path";
    --sm.pointer;
  }

  return true;
};

safe_URLStateMachineSteps["parse file slash"] = function parseFileSlash(sm, c) {
  if (c === p("/") || c === p("\\")) {
    if (c === p("\\")) {
      sm.parseError = true;
    }
    sm.state = "file host";
  } else {
    if (sm.base !== null && sm.base.scheme === "file") {
      if (
        !startsWithWindowsDriveLetter(sm.input, sm.pointer) &&
        isNormalizedWindowsDriveLetterString(sm.base.path[0]!)
      ) {
        ArrayPrototypePush(sm.url.path as string[], sm.base.path[0]!);
      }
      sm.url.host = sm.base.host;
    }
    sm.state = "path";
    --sm.pointer;
  }

  return true;
};

safe_URLStateMachineSteps["parse file host"] = function parseFileHost(
  sm,
  c,
  cStr
) {
  if (
    isNaN(c) ||
    c === p("/") ||
    c === p("\\") ||
    c === p("?") ||
    c === p("#")
  ) {
    --sm.pointer;
    if (!sm.stateOverride && isWindowsDriveLetterString(sm.buffer)) {
      sm.parseError = true;
      sm.state = "path";
    } else if (sm.buffer === "") {
      sm.url.host = "";
      if (sm.stateOverride) {
        return false;
      }
      sm.state = "path start";
    } else {
      let host = parseHost(sm.buffer, isNotSpecial(sm.url));
      if (host === failure) {
        return failure;
      }
      if (host === "localhost") {
        host = "";
      }
      sm.url.host = host;

      if (sm.stateOverride) {
        return false;
      }

      sm.buffer = "";
      sm.state = "path start";
    }
  } else {
    sm.buffer += cStr;
  }

  return true;
};

safe_URLStateMachineSteps["parse path start"] = function parsePathStart(sm, c) {
  if (isSpecial(sm.url)) {
    if (c === p("\\")) {
      sm.parseError = true;
    }
    sm.state = "path";

    if (c !== p("/") && c !== p("\\")) {
      --sm.pointer;
    }
  } else if (!sm.stateOverride && c === p("?")) {
    sm.url.query = "";
    sm.state = "query";
  } else if (!sm.stateOverride && c === p("#")) {
    sm.url.fragment = "";
    sm.state = "fragment";
  } else if (c !== undefined) {
    sm.state = "path";
    if (c !== p("/")) {
      --sm.pointer;
    }
  } else if (sm.stateOverride && sm.url.host === null) {
    ArrayPrototypePush(sm.url.path as string[], "");
  }

  return true;
};

safe_URLStateMachineSteps["parse path"] = function parsePath(sm, c) {
  if (
    isNaN(c) ||
    c === p("/") ||
    (isSpecial(sm.url) && c === p("\\")) ||
    (!sm.stateOverride && (c === p("?") || c === p("#")))
  ) {
    if (isSpecial(sm.url) && c === p("\\")) {
      sm.parseError = true;
    }

    if (isDoubleDot(sm.buffer)) {
      shortenPath(sm.url as URLRecord & { path: string[] });
      if (c !== p("/") && !(isSpecial(sm.url) && c === p("\\"))) {
        ArrayPrototypePush(sm.url.path as string[], "");
      }
    } else if (
      isSingleDot(sm.buffer) &&
      c !== p("/") &&
      !(isSpecial(sm.url) && c === p("\\"))
    ) {
      ArrayPrototypePush(sm.url.path as string[], "");
    } else if (!isSingleDot(sm.buffer)) {
      if (
        sm.url.scheme === "file" &&
        sm.url.path.length === 0 &&
        isWindowsDriveLetterString(sm.buffer)
      ) {
        sm.buffer = `${sm.buffer[0]}:`;
      }
      ArrayPrototypePush(sm.url.path as string[], sm.buffer);
    }
    sm.buffer = "";
    if (c === p("?")) {
      sm.url.query = "";
      sm.state = "query";
    }
    if (c === p("#")) {
      sm.url.fragment = "";
      sm.state = "fragment";
    }
  } else {
    // TODO: If c is not a URL code point and not "%", parse error.

    if (
      c === p("%") &&
      (!isASCIIHex(sm.input[sm.pointer + 1]!) ||
        !isASCIIHex(sm.input[sm.pointer + 2]!))
    ) {
      sm.parseError = true;
    }

    sm.buffer += utf8PercentEncodeCodePoint(c, isPathPercentEncode);
  }

  return true;
};

safe_URLStateMachineSteps["parse opaque path"] = function parseOpaquePath(
  sm,
  c
) {
  if (c === p("?")) {
    sm.url.query = "";
    sm.state = "query";
  } else if (c === p("#")) {
    sm.url.fragment = "";
    sm.state = "fragment";
  } else {
    // TODO: Add: not a URL code point
    if (!isNaN(c) && c !== p("%")) {
      sm.parseError = true;
    }

    if (
      c === p("%") &&
      (!isASCIIHex(sm.input[sm.pointer + 1]!) ||
        !isASCIIHex(sm.input[sm.pointer + 2]!))
    ) {
      sm.parseError = true;
    }

    if (!isNaN(c)) {
      sm.url.path += utf8PercentEncodeCodePoint(c, isC0ControlPercentEncode);
    }
  }

  return true;
};

safe_URLStateMachineSteps["parse query"] = function parseQuery(sm, c, cStr) {
  if (!isSpecial(sm.url) || sm.url.scheme === "ws" || sm.url.scheme === "wss") {
    sm.encodingOverride = "utf-8";
  }

  if ((!sm.stateOverride && c === p("#")) || isNaN(c)) {
    const queryPercentEncodePredicate = isSpecial(sm.url)
      ? isSpecialQueryPercentEncode
      : isQueryPercentEncode;
    sm.url.query += utf8PercentEncodeString(
      sm.buffer,
      queryPercentEncodePredicate
    );

    sm.buffer = "";

    if (c === p("#")) {
      sm.url.fragment = "";
      sm.state = "fragment";
    }
  } else if (!isNaN(c)) {
    // TODO: If c is not a URL code point and not "%", parse error.

    if (
      c === p("%") &&
      (!isASCIIHex(sm.input[sm.pointer + 1]!) ||
        !isASCIIHex(sm.input[sm.pointer + 2]!))
    ) {
      sm.parseError = true;
    }

    sm.buffer += cStr;
  }

  return true;
};

safe_URLStateMachineSteps["parse fragment"] = function parseFragment(sm, c) {
  if (!isNaN(c)) {
    // TODO: If c is not a URL code point and not "%", parse error.
    if (
      c === p("%") &&
      (!isASCIIHex(sm.input[sm.pointer + 1]!) ||
        !isASCIIHex(sm.input[sm.pointer + 2]!))
    ) {
      sm.parseError = true;
    }

    sm.url.fragment += utf8PercentEncodeCodePoint(c, isFragmentPercentEncode);
  }

  return true;
};

export function serializeURL(url: URLRecord, excludeFragment?: boolean) {
  let output = `${url.scheme}:`;
  if (url.host !== null) {
    output += "//";

    if (url.username !== "" || url.password !== "") {
      output += url.username;
      if (url.password !== "") {
        output += `:${url.password}`;
      }
      output += "@";
    }

    output += serializeHost(url.host);

    if (url.port !== null) {
      output += `:${url.port}`;
    }
  }

  if (
    url.host === null &&
    !hasAnOpaquePath(url) &&
    url.path.length > 1 &&
    url.path[0] === ""
  ) {
    output += "/.";
  }
  output += serializePath(url);

  if (url.query !== null) {
    output += `?${url.query}`;
  }

  if (!excludeFragment && url.fragment !== null) {
    output += `#${url.fragment}`;
  }

  return output;
}

function serializeOrigin(tuple: {
  scheme: string;
  host: string;
  port: number | null;
}) {
  let result = `${tuple.scheme}://`;
  result += serializeHost(tuple.host);

  if (tuple.port !== null) {
    result += `:${tuple.port}`;
  }

  return result;
}

export function serializePath(url: URLRecord) {
  if (hasAnOpaquePath(url)) {
    return url.path;
  }

  let output = "";
  for (const segment of url.path) {
    output += `/${segment}`;
  }
  return output;
}

export function serializeURLOrigin(url: URLRecord) {
  // https://url.spec.whatwg.org/#concept-url-origin
  switch (url.scheme) {
    case "blob": {
      const pathURL = parseURL(serializePath(url));
      if (pathURL === null) {
        return "null";
      }
      if (pathURL.scheme !== "http" && pathURL.scheme !== "https") {
        return "null";
      }
      return serializeURLOrigin(pathURL);
    }
    case "ftp":
    case "http":
    case "https":
    case "ws":
    case "wss":
      return serializeOrigin({
        scheme: url.scheme,
        host: url.host as string,
        port: url.port,
      });
    case "file":
      // The spec says:
      // > Unfortunate as it is, this is left as an exercise to the reader. When in doubt, return a new opaque origin.
      // Browsers tested so far:
      // - Chrome says "file://", but treats file: URLs as cross-origin for most (all?) purposes; see e.g.
      //   https://bugs.chromium.org/p/chromium/issues/detail?id=37586
      // - Firefox says "null", but treats file: URLs as same-origin sometimes based on directory stuff; see
      //   https://developer.mozilla.org/en-US/docs/Archive/Misc_top_level/Same-origin_policy_for_file:_URIs
      return "null";
    default:
      // serializing an opaque origin returns "null"
      return "null";
  }
}

export function basicURLParse(
  input: string,
  options?: {
    baseURL?: URLRecord | null | undefined;
    encodingOverride?: string | null | undefined;
    url?: URLRecord;
    stateOverride?: string | null | undefined;
  }
) {
  if (options === undefined) {
    options = {};
  }

  const usm = createURLStateMachine(
    input,
    options.baseURL,
    options.encodingOverride,
    options.url,
    options.stateOverride
  );
  if (usm.failure) {
    return null;
  }

  return usm.url;
}

export function setTheUsername(url: URLRecord, username: string) {
  url.username = utf8PercentEncodeString(username, isUserinfoPercentEncode);
}

export function setThePassword(url: URLRecord, password: string) {
  url.password = utf8PercentEncodeString(password, isUserinfoPercentEncode);
}

function parseURL(
  input: string,
  options?: { baseURL?: URLRecord; encodingOverride?: string }
) {
  if (options === undefined) {
    options = {};
  }

  // We don't handle blobs, so this just delegates:
  return basicURLParse(input, {
    baseURL: options.baseURL,
    encodingOverride: options.encodingOverride,
  });
}
