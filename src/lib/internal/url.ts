// Copyright 2018-2025 the Deno authors. MIT license.
import { primordials, primordialUtils } from "emjs:internal/internals";
import {
  CHAR_AMPERSAND,
  CHAR_EQUAL,
  CHAR_PERCENT,
  CHAR_PLUS,
} from "emjs:internal/constants";
import * as safe_webidl from "emjs:internal/webidl";
import {
  basicURLParse,
  URLRecord,
  hasAnOpaquePath,
  serializeHost,
  serializeURL,
  serializeURLOrigin,
  cannotHaveAUsernamePasswordPort,
  setThePassword,
  serializePath,
  setTheUsername,
} from "emjs:internal/url/state-machine";
const { ArrayPrototypeMap, SafeWeakMap } = primordialUtils;
const {
  Symbol,
  ArrayIsArray,
  ArrayPrototypePush,
  ArrayPrototypeSome,
  ArrayPrototypeSort,
  ArrayPrototypeSplice,
  ObjectKeys,
  StringPrototypeSlice,
  TypeError,
  URIError,
  StringPrototypeCharCodeAt,
  Int8Array,
  Array,
  StringPrototypeToUpperCase,
  NumberPrototypeToString,
  decodeURIComponent,
  String,
  ArrayPrototypeSlice,
  RegExpPrototypeSymbolReplace,
  NumberPOSITIVE_INFINITY,
} = primordials;

// prettier-ignore
const isHexTable = new Int8Array([
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // 0 - 15
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // 16 - 31
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // 32 - 47
  1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, // 48 - 63
  0, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, // 64 - 79
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // 80 - 95
  0, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, // 96 - 111
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // 112 - 127
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // 128 ...
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,  // ... 256
]);

function encodeStr(
  str: string,
  noEscapeTable: InstanceType<typeof Int8Array>,
  hexTable: string[]
): string {
  const len = str.length;
  if (len === 0) return "";

  let out = "";
  let lastPos = 0;
  let i = 0;

  outer: for (; i < len; i++) {
    let c = StringPrototypeCharCodeAt(str, i);

    // ASCII
    while (c < 0x80) {
      if (noEscapeTable[c] !== 1) {
        if (lastPos < i) out += StringPrototypeSlice(str, lastPos, i);
        lastPos = i + 1;
        out += hexTable[c];
      }

      if (++i === len) break outer;

      c = StringPrototypeCharCodeAt(str, i);
    }

    if (lastPos < i) out += StringPrototypeSlice(str, lastPos, i);

    // Multi-byte characters ...
    if (c < 0x800) {
      lastPos = i + 1;
      out += hexTable[0xc0 | (c >> 6)]! + hexTable[0x80 | (c & 0x3f)];
      continue;
    }
    if (c < 0xd800 || c >= 0xe000) {
      lastPos = i + 1;
      out +=
        hexTable[0xe0 | (c >> 12)]! +
        hexTable[0x80 | ((c >> 6) & 0x3f)] +
        hexTable[0x80 | (c & 0x3f)];
      continue;
    }
    // Surrogate pair
    ++i;

    // This branch should never happen because all URLSearchParams entries
    // should already be converted to USVString. But, included for
    // completion's sake anyway.
    if (i >= len) throw new URIError();

    const c2 = StringPrototypeCharCodeAt(str, i) & 0x3ff;

    lastPos = i + 1;
    c = 0x10000 + (((c & 0x3ff) << 10) | c2);
    out +=
      hexTable[0xf0 | (c >> 18)]! +
      hexTable[0x80 | ((c >> 12) & 0x3f)] +
      hexTable[0x80 | ((c >> 6) & 0x3f)] +
      hexTable[0x80 | (c & 0x3f)];
  }
  if (lastPos === 0) return str;
  if (lastPos < len) return out + StringPrototypeSlice(str, lastPos);
  return out;
}

// Adapted from querystring's implementation.
// Ref: https://url.spec.whatwg.org/#concept-urlencoded-byte-serializer
// prettier-ignore
const noEscape = new Int8Array([
  /*
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, A, B, C, D, E, F
  */
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // 0x00 - 0x0F
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // 0x10 - 0x1F
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 1, 0, // 0x20 - 0x2F
    1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, // 0x30 - 0x3F
    0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, // 0x40 - 0x4F
    1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 1, // 0x50 - 0x5F
    0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, // 0x60 - 0x6F
    1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0,  // 0x70 - 0x7F
  ]);

const hexTable = new Array(256);
for (let i = 0; i < 256; ++i)
  hexTable[i] =
    "%" +
    StringPrototypeToUpperCase(
      (i < 16 ? "0" : "") + NumberPrototypeToString(i, 16)
    );

// Special version of hexTable that uses `+` for U+0020 SPACE.
const paramHexTable = ArrayPrototypeSlice(hexTable);
paramHexTable[0x20] = "+";

// application/x-www-form-urlencoded serializer
// Ref: https://url.spec.whatwg.org/#concept-urlencoded-serializer
function serializeParams(array: [string, string][]) {
  const len = array.length;
  if (len === 0) return "";

  const firstEncodedParam = encodeStr(array[0]![0], noEscape, paramHexTable);
  const firstEncodedValue = encodeStr(array[0]![1], noEscape, paramHexTable);
  let output = `${firstEncodedParam}=${firstEncodedValue}`;

  for (let i = 1; i < len; i++) {
    const encodedParam = encodeStr(array[i]![0], noEscape, paramHexTable);
    const encodedValue = encodeStr(array[i]![1], noEscape, paramHexTable);
    output += `&${encodedParam}=${encodedValue}`;
  }

  return output;
}

// application/x-www-form-urlencoded parser
// Ref: https://url.spec.whatwg.org/#concept-urlencoded-parser
function parseParams(
  qs: string,
  pairs: [string, string][] = []
): [string, string][] {
  let pair: [string, string] = ["", ""];
  let seenSep = false;
  let buf = "";
  let encoded = false;
  let encodeCheck = 0;
  let i = 0;
  let pairStart = i;
  let lastPos = i;
  for (; i < qs.length; ++i) {
    const code = StringPrototypeCharCodeAt(qs, i);

    // Try matching key/value pair separator
    if (code === CHAR_AMPERSAND) {
      if (pairStart === i) {
        // We saw an empty substring between pair separators
        lastPos = pairStart = i + 1;
        continue;
      }

      if (lastPos < i) buf += StringPrototypeSlice(qs, lastPos, i);
      if (encoded) buf = decodeURIComponent(buf);

      // If `buf` is the key, add an empty value.

      pair[+seenSep] = buf;
      ArrayPrototypePush(pairs, pair);
      pair = ["", ""];

      seenSep = false;
      buf = "";
      encoded = false;
      encodeCheck = 0;
      lastPos = pairStart = i + 1;
      continue;
    }

    // Try matching key/value separator (e.g. '=') if we haven't already
    if (!seenSep && code === CHAR_EQUAL) {
      // Key/value separator match!
      if (lastPos < i) buf += StringPrototypeSlice(qs, lastPos, i);
      if (encoded) buf = decodeURIComponent(buf);
      pair[0] = buf;

      seenSep = true;
      buf = "";
      encoded = false;
      encodeCheck = 0;
      lastPos = i + 1;
      continue;
    }

    // Handle + and percent decoding.
    if (code === CHAR_PLUS) {
      if (lastPos < i) buf += StringPrototypeSlice(qs, lastPos, i);
      buf += " ";
      lastPos = i + 1;
    } else if (!encoded) {
      // Try to match an (valid) encoded byte (once) to minimize unnecessary
      // calls to string decoding functions
      if (code === CHAR_PERCENT) {
        encodeCheck = 1;
      } else if (encodeCheck > 0) {
        if (isHexTable[code] === 1) {
          if (++encodeCheck === 3) {
            encoded = true;
          }
        } else {
          encodeCheck = 0;
        }
      }
    }
  }

  // Deal with any leftover key or value data

  // There is a trailing &. No more processing is needed.
  if (pairStart === i) return pairs;

  if (lastPos < i) buf += StringPrototypeSlice(qs, lastPos, i);
  if (encoded) buf = decodeURIComponent(buf);
  pair[+seenSep] = buf;
  ArrayPrototypePush(pairs, pair);

  return pairs;
}

const safe_urlObjectMap: primordialUtils.SafeWeakMap<URLSearchParams, URL> =
  new SafeWeakMap();
const safe_listMap: primordialUtils.SafeWeakMap<
  URLSearchParams,
  [string, string][]
> = new SafeWeakMap();

class URLSearchParams {
  constructor(rawInit: unknown = undefined) {
    const prefix = "Failed to construct 'URL'";
    safe_webidl.brandInstance(this);
    if (rawInit == null) {
      // if there is no query string, return early
      safe_listMap.set(this, []);
      return;
    }
    let init = safe_webidl.converters[
      "sequence<sequence<USVString>> or record<USVString, USVString> or USVString"
    ](rawInit, prefix, "Argument 1");

    if (typeof init === "string") {
      // Overload: USVString
      // If init is a string and starts with U+003F (?),
      // remove the first code point from init.
      if (init[0] == "?") {
        init = StringPrototypeSlice(init, 1);
      }
      safe_listMap.set(this, parseParams(init));
    } else if (ArrayIsArray(init)) {
      // Overload: sequence<sequence<USVString>>
      safe_listMap.set(
        this,
        ArrayPrototypeMap(init, (pair, i) => {
          if (pair.length !== 2) {
            throw new TypeError(
              `${prefix}: Item ${
                i + 0
              } in the parameter list does have length 2 exactly`
            );
          }
          return [pair[0]!, pair[1]!];
        })
      );
    } else {
      // Overload: record<USVString, USVString>
      safe_listMap.set(
        this,
        ArrayPrototypeMap(ObjectKeys(init), (key) => [
          key,
          (init as Record<string, string>)[key]!,
        ])
      );
    }
  }

  #updateUrlSearch() {
    const url = safe_urlObjectMap.get(this);
    if (url === undefined) {
      return;
    }
    URLParse(_updateUrlSearch, this.#toString(), url);
  }

  append(name: string, value: string) {
    safe_webidl.assertBranded(this, URLSearchParamsPrototype);
    const prefix = "Failed to execute 'append' on 'URLSearchParams'";
    safe_webidl.requiredArguments(arguments.length, 2, prefix);
    name = safe_webidl.converters.USVString(name, prefix, "Argument 1");
    value = safe_webidl.converters.USVString(value, prefix, "Argument 2");
    ArrayPrototypePush(safe_listMap.get(this)!, [name, value]);
    this.#updateUrlSearch();
  }

  delete(name: string, value: string | undefined = undefined) {
    safe_webidl.assertBranded(this, URLSearchParamsPrototype);
    const prefix = "Failed to execute 'append' on 'URLSearchParams'";
    safe_webidl.requiredArguments(arguments.length, 1, prefix);
    name = safe_webidl.converters.USVString(name, prefix, "Argument 1");
    const list = safe_listMap.get(this)!;
    let i = 0;
    if (value === undefined) {
      while (i < list.length) {
        if (list[i]![0] === name) {
          ArrayPrototypeSplice(list, i, 1);
        } else {
          i++;
        }
      }
    } else {
      value = safe_webidl.converters.USVString(value, prefix, "Argument 2");
      while (i < list.length) {
        if (list[i]![0] === name && list[i]![1] === value) {
          ArrayPrototypeSplice(list, i, 1);
        } else {
          i++;
        }
      }
    }
    this.#updateUrlSearch();
  }

  getAll(name: string): string[] {
    safe_webidl.assertBranded(this, URLSearchParamsPrototype);
    const prefix = "Failed to execute 'getAll' on 'URLSearchParams'";
    safe_webidl.requiredArguments(arguments.length, 1, prefix);
    name = safe_webidl.converters.USVString(name, prefix, "Argument 1");
    const values: string[] = [];
    const entries = safe_listMap.get(this)!;
    for (let i = 0; i < entries.length; ++i) {
      const entry = entries[i]!;
      if (entry[0] === name) {
        ArrayPrototypePush(values, entry[1]);
      }
    }
    return values;
  }

  get(name: string): string | null {
    safe_webidl.assertBranded(this, URLSearchParamsPrototype);
    const prefix = "Failed to execute 'get' on 'URLSearchParams'";
    safe_webidl.requiredArguments(arguments.length, 1, prefix);
    name = safe_webidl.converters.USVString(name, prefix, "Argument 1");
    const entries = safe_listMap.get(this)!;
    for (let i = 0; i < entries.length; ++i) {
      const entry = entries[i]!;
      if (entry[0] === name) {
        return entry[1];
      }
    }
    return null;
  }

  has(name: string, value: string | undefined = undefined): boolean {
    safe_webidl.assertBranded(this, URLSearchParamsPrototype);
    const prefix = "Failed to execute 'has' on 'URLSearchParams'";
    safe_webidl.requiredArguments(arguments.length, 1, prefix);
    name = safe_webidl.converters.USVString(name, prefix, "Argument 1");
    if (value !== undefined) {
      value = safe_webidl.converters.USVString(value, prefix, "Argument 2");
      return ArrayPrototypeSome(
        safe_listMap.get(this)!,
        (entry) => entry[0] === name && entry[1] === value
      );
    }
    return ArrayPrototypeSome(
      safe_listMap.get(this)!,
      (entry) => entry[0] === name
    );
  }

  set(name: string, value: string) {
    safe_webidl.assertBranded(this, URLSearchParamsPrototype);
    const prefix = "Failed to execute 'set' on 'URLSearchParams'";
    safe_webidl.requiredArguments(arguments.length, 2, prefix);
    name = safe_webidl.converters.USVString(name, prefix, "Argument 1");
    value = safe_webidl.converters.USVString(value, prefix, "Argument 2");

    const list = safe_listMap.get(this)!;

    // If there are any name-value pairs whose name is name, in list,
    // set the value of the first such name-value pair to value
    // and remove the others.
    let found = false;
    let i = 0;
    while (i < list.length) {
      if (list[i]![0] === name) {
        if (!found) {
          list[i]![1] = value;
          found = true;
          i++;
        } else {
          ArrayPrototypeSplice(list, i, 1);
        }
      } else {
        i++;
      }
    }

    // Otherwise, append a new name-value pair whose name is name
    // and value is value, to list.
    if (!found) {
      ArrayPrototypePush(list, [name, value]);
    }

    this.#updateUrlSearch();
  }

  sort() {
    safe_webidl.assertBranded(this, URLSearchParamsPrototype);
    ArrayPrototypeSort(safe_listMap.get(this)!, (a, b) =>
      a[0] === b[0] ? 0 : a[0] > b[0] ? 1 : -1
    );
    this.#updateUrlSearch();
  }

  toString(): string {
    safe_webidl.assertBranded(this, URLSearchParamsPrototype);
    return this.#toString();
  }

  #toString(): string {
    return serializeParams(safe_listMap.get(this)!);
  }

  get size() {
    safe_webidl.assertBranded(this, URLSearchParamsPrototype);
    return safe_listMap.get(this)!.length;
  }
}

safe_webidl.mixinPairIterable(
  "URLSearchParams",
  URLSearchParams,
  safe_listMap,
  0,
  1
);

safe_webidl.configureInterface(URLSearchParams);
const URLSearchParamsPrototype = URLSearchParams.prototype;

declare module "emjs:internal/webidl" {
  interface Converters {
    ["URLSearchParams"]: (
      v: unknown,
      prefix?: string,
      context?: string,
      opts?: unknown
    ) => URLSearchParams;
  }
}

safe_webidl.converters["URLSearchParams"] =
  safe_webidl.createInterfaceConverter(
    "URLSearchParams",
    URLSearchParamsPrototype
  );

const _updateUrlSearch: unique symbol = Symbol("updateUrlSearch") as never;

const skipInit: unique symbol = Symbol("skipInit") as never;

function potentiallyStripTrailingSpacesFromAnOpaquePath(url: URLRecord) {
  if (!hasAnOpaquePath(url)) {
    return;
  }

  if (url.fragment !== null) {
    return;
  }

  if (url.query !== null) {
    return;
  }

  url.path = RegExpPrototypeSymbolReplace(/\u0020+$/u, url.path, "");
}

class URL {
  #urlRecord!: URLRecord;
  #queryObject?: URLSearchParams;
  #updateSearchParams() {
    const list = safe_listMap.get(this.#queryObject!);
    if (list) {
      ArrayPrototypeSplice(list, 0, NumberPOSITIVE_INFINITY);
      const { query } = this.#urlRecord;
      if (query !== null) {
        parseParams(query, list);
      }
    }
  }

  constructor(
    url: string | typeof skipInit,
    base: string | undefined = undefined
  ) {
    safe_webidl.brandInstance(this);
    // skip initialization for URL.parse
    if (url === skipInit) {
      return;
    }
    const prefix = "Failed to construct 'URL'";
    safe_webidl.requiredArguments(arguments.length, 1, prefix);
    url = safe_webidl.converters.DOMString(url, prefix, "Argument 1");
    if (base !== undefined) {
      base = safe_webidl.converters.DOMString(base, prefix, "Argument 2");
    }

    let parsedBase = null;
    if (base !== undefined) {
      parsedBase = basicURLParse(base);
      if (parsedBase === null) {
        throw new TypeError(`Invalid base URL: ${base}`);
      }
    }

    const parsedURL = basicURLParse(url, { baseURL: parsedBase });
    if (parsedURL === null) {
      throw new TypeError(`Invalid URL: ${url}`);
    }
    this.#urlRecord = parsedURL;
  }

  static parse(
    url: string | typeof _updateUrlSearch,
    base: string | undefined = undefined,
    instance: URL | undefined = undefined
  ) {
    if (url === _updateUrlSearch) {
      instance!.#urlRecord.query = "";
      basicURLParse(base!, {
        url: instance!.#urlRecord,
        stateOverride: "query",
      });
      return;
    }

    const prefix = "Failed to execute 'URL.parse'";
    safe_webidl.requiredArguments(arguments.length, 1, prefix);
    url = safe_webidl.converters.DOMString(url, prefix, "Argument 1");
    if (base !== undefined) {
      base = safe_webidl.converters.DOMString(base, prefix, "Argument 2");
    }

    let parsedBase = null;
    if (base !== undefined) {
      parsedBase = basicURLParse(base);
      if (parsedBase === null) {
        return null;
      }
    }

    const parsedURL = basicURLParse(url, { baseURL: parsedBase });
    if (parsedURL === null) {
      return null;
    }

    // If initialized with webidl.createBranded, private properties are not be accessible,
    // so it is passed through the constructor
    const self = new this(skipInit);
    self.#urlRecord = parsedURL;
    return self;
  }

  static canParse(url: string, base: string | undefined = undefined) {
    const prefix = "Failed to execute 'URL.canParse'";
    safe_webidl.requiredArguments(arguments.length, 1, prefix);
    url = safe_webidl.converters.DOMString(url, prefix, "Argument 1");
    if (base !== undefined) {
      base = safe_webidl.converters.DOMString(base, prefix, "Argument 2");
    }
    let parsedBase = null;
    if (base !== undefined) {
      parsedBase = basicURLParse(base);
      if (parsedBase === null) {
        return false;
      }
    }
    const parsedURL = basicURLParse(url, { baseURL: parsedBase });
    if (parsedURL === null) {
      return false;
    }
    return true;
  }

  get hash(): string {
    safe_webidl.assertBranded(this, URLPrototype);
    if (this.#urlRecord.fragment === null || this.#urlRecord.fragment === "") {
      return "";
    }

    return `#${this.#urlRecord.fragment}`;
  }

  set hash(value: string) {
    safe_webidl.assertBranded(this, URLPrototype);
    const prefix = "Failed to set 'hash' on 'URL'";
    safe_webidl.requiredArguments(arguments.length, 1, prefix);
    value = safe_webidl.converters.DOMString(value, prefix, "Argument 1");
    if (value === "") {
      this.#urlRecord.fragment = null;
      potentiallyStripTrailingSpacesFromAnOpaquePath(this.#urlRecord);
      return;
    }

    const input = value[0] === "#" ? StringPrototypeSlice(value, 1) : value;
    this.#urlRecord.fragment = "";
    basicURLParse(input, { url: this.#urlRecord, stateOverride: "fragment" });
  }

  /** @return {string} */
  get host(): string {
    safe_webidl.assertBranded(this, URLPrototype);
    const url = this.#urlRecord;

    if (url.host === null) {
      return "";
    }

    if (url.port === null) {
      return serializeHost(url.host)!;
    }

    return `${serializeHost(url.host)}:${url.port}`;
  }

  /** @param {string} value */
  set host(value: string) {
    safe_webidl.assertBranded(this, URLPrototype);
    const prefix = "Failed to set 'host' on 'URL'";
    safe_webidl.requiredArguments(arguments.length, 1, prefix);
    value = safe_webidl.converters.DOMString(value, prefix, "Argument 1");
    if (hasAnOpaquePath(this.#urlRecord)) {
      return;
    }

    basicURLParse(value, { url: this.#urlRecord, stateOverride: "host" });
  }

  /** @return {string} */
  get hostname(): string {
    safe_webidl.assertBranded(this, URLPrototype);
    if (this.#urlRecord.host === null) {
      return "";
    }

    return serializeHost(this.#urlRecord.host)!;
  }

  /** @param {string} value */
  set hostname(value: string) {
    safe_webidl.assertBranded(this, URLPrototype);
    const prefix = "Failed to set 'hostname' on 'URL'";
    safe_webidl.requiredArguments(arguments.length, 1, prefix);
    value = safe_webidl.converters.DOMString(value, prefix, "Argument 1");
    if (hasAnOpaquePath(this.#urlRecord)) {
      return;
    }

    basicURLParse(value, { url: this.#urlRecord, stateOverride: "hostname" });
  }

  get href(): string {
    safe_webidl.assertBranded(this, URLPrototype);
    return this.#href;
  }

  get #href(): string {
    return serializeURL(this.#urlRecord);
  }

  set href(value: string) {
    safe_webidl.assertBranded(this, URLPrototype);
    const prefix = "Failed to set 'href' on 'URL'";
    safe_webidl.requiredArguments(arguments.length, 1, prefix);
    value = safe_webidl.converters.DOMString(value, prefix, "Argument 1");
    const parsedURL = basicURLParse(value);
    if (parsedURL === null) {
      throw new TypeError(`Invalid URL: ${value}`);
    }

    this.#urlRecord = parsedURL;
    this.#updateSearchParams();
  }

  get origin(): string {
    safe_webidl.assertBranded(this, URLPrototype);
    return serializeURLOrigin(this.#urlRecord);
  }

  get password(): string {
    safe_webidl.assertBranded(this, URLPrototype);
    return this.#urlRecord.password;
  }

  set password(value: string) {
    safe_webidl.assertBranded(this, URLPrototype);
    const prefix = "Failed to set 'password' on 'URL'";
    safe_webidl.requiredArguments(arguments.length, 1, prefix);
    value = safe_webidl.converters.DOMString(value, prefix, "Argument 1");
    try {
      if (cannotHaveAUsernamePasswordPort(this.#urlRecord)) {
        return;
      }

      setThePassword(this.#urlRecord, value);
    } catch {
      /* pass */
    }
  }

  get pathname(): string {
    safe_webidl.assertBranded(this, URLPrototype);
    return serializePath(this.#urlRecord);
  }

  set pathname(value: string) {
    safe_webidl.assertBranded(this, URLPrototype);
    const prefix = "Failed to set 'pathname' on 'URL'";
    safe_webidl.requiredArguments(arguments.length, 1, prefix);
    value = safe_webidl.converters.DOMString(value, prefix, "Argument 1");
    try {
      if (hasAnOpaquePath(this.#urlRecord)) {
        return;
      }

      this.#urlRecord.path = [];
      basicURLParse(value, {
        url: this.#urlRecord,
        stateOverride: "path start",
      });
    } catch {
      /* pass */
    }
  }

  get port(): string {
    safe_webidl.assertBranded(this, URLPrototype);
    if (this.#urlRecord.port === null) {
      return "";
    }
    return String(this.#urlRecord.port);
  }

  set port(value: string) {
    safe_webidl.assertBranded(this, URLPrototype);
    const prefix = "Failed to set 'port' on 'URL'";
    safe_webidl.requiredArguments(arguments.length, 1, prefix);
    value = safe_webidl.converters.DOMString(value, prefix, "Argument 1");
    if (cannotHaveAUsernamePasswordPort(this.#urlRecord)) {
      return;
    }

    if (value === "") {
      this.#urlRecord.port = null;
    } else {
      basicURLParse(value, { url: this.#urlRecord, stateOverride: "port" });
    }
  }

  get protocol(): string {
    safe_webidl.assertBranded(this, URLPrototype);
    return `${this.#urlRecord.scheme}:`;
  }

  set protocol(value: string) {
    safe_webidl.assertBranded(this, URLPrototype);
    const prefix = "Failed to set 'protocol' on 'URL'";
    safe_webidl.requiredArguments(arguments.length, 1, prefix);
    value = safe_webidl.converters.DOMString(value, prefix, "Argument 1");
    try {
      basicURLParse(`${value}:`, {
        url: this.#urlRecord,
        stateOverride: "scheme start",
      });
    } catch {
      /* pass */
    }
  }

  get search(): string {
    safe_webidl.assertBranded(this, URLPrototype);
    return this.#search;
  }

  get #search(): string {
    if (this.#urlRecord.query === null || this.#urlRecord.query === "") {
      return "";
    }

    return `?${this.#urlRecord.query}`;
  }

  set search(value: string) {
    safe_webidl.assertBranded(this, URLPrototype);
    const prefix = "Failed to set 'search' on 'URL'";
    safe_webidl.requiredArguments(arguments.length, 1, prefix);
    value = safe_webidl.converters.DOMString(value, prefix, "Argument 1");
    try {
      const url = this.#urlRecord;

      if (value === "") {
        url.query = null;
        safe_listMap.get(this.#queryObject!)?.splice(0);
        potentiallyStripTrailingSpacesFromAnOpaquePath(this.#urlRecord);
        return;
      }

      const input = value[0] === "?" ? StringPrototypeSlice(value, 1) : value;
      url.query = "";
      basicURLParse(input, { url, stateOverride: "query" });
      this.#updateSearchParams();
    } catch {
      /* pass */
    }
  }

  get username(): string {
    safe_webidl.assertBranded(this, URLPrototype);
    // https://github.com/servo/rust-url/blob/1d307ae51a28fecc630ecec03380788bfb03a643/url/src/lib.rs#L881
    return this.#urlRecord.username;
  }

  set username(value: string) {
    safe_webidl.assertBranded(this, URLPrototype);
    const prefix = "Failed to set 'username' on 'URL'";
    safe_webidl.requiredArguments(arguments.length, 1, prefix);
    value = safe_webidl.converters.DOMString(value, prefix, "Argument 1");
    try {
      if (cannotHaveAUsernamePasswordPort(this.#urlRecord)) {
        return;
      }

      setTheUsername(this.#urlRecord, value);
    } catch {
      /* pass */
    }
  }

  get searchParams(): URLSearchParams {
    if (this.#queryObject == null) {
      this.#queryObject = new URLSearchParams(this.#search);
      safe_urlObjectMap.set(this.#queryObject, this);
    }
    return this.#queryObject;
  }

  toString(): string {
    safe_webidl.assertBranded(this, URLPrototype);
    return this.#href;
  }

  toJSON(): string {
    safe_webidl.assertBranded(this, URLPrototype);
    return this.#href;
  }
}
const URLParse = URL.parse;

safe_webidl.configureInterface(URL);
const URLPrototype = URL.prototype;

export { URL, URLSearchParams };
