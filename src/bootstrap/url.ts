/* eslint-disable @typescript-eslint/ban-ts-comment */
// Copyright 2018-2025 the Deno authors. MIT license.
// @ts-nocheck
import { Internals } from "./bootstrap.js";
import {
  CHAR_AMPERSAND,
  CHAR_EQUAL,
  CHAR_PERCENT,
  CHAR_PLUS,
} from "./constants.js";
import { ArrayPrototypeMap, SafeArrayIterator } from "./primordial-utils.js";
import {
  undefined,
  ArrayIsArray,
  ArrayPrototypePush,
  ArrayPrototypeSome,
  ArrayPrototypeSort,
  ArrayPrototypeSplice,
  ObjectKeys,
  StringPrototypeSlice,
  StringPrototypeStartsWith,
  Symbol,
  SymbolIterator,
  TypeError,
  Uint32Array,
  URIError,
  StringPrototypeCharCodeAt,
  Int8Array,
  Array,
  StringPrototypeToUpperCase,
  NumberPrototypeToString,
  decodeURIComponent,
} from "./primordials.js";
import * as webidl from "./webidl.js";

export function createURLClasses(internals: Internals) {
  const _list: unique symbol = Symbol("list") as never;
  const _urlObject: unique symbol = Symbol("url object") as never;

  // WARNING: must match rust code's UrlSetter::*
  const SET_HASH = 0;
  const SET_HOST = 1;
  const SET_HOSTNAME = 2;
  const SET_PASSWORD = 3;
  const SET_PATHNAME = 4;
  const SET_PORT = 5;
  const SET_PROTOCOL = 6;
  const SET_SEARCH = 7;
  const SET_USERNAME = 8;

  // Helper functions
  function opUrlReparse(href: string, setter: number, value: string): string {
    const status = internals.url_reparse(href, setter, value, componentsBuf.buffer);
    return getSerialization(status, href);
  }

  function opUrlParse(href: string, maybeBase?: string): number {
    return internals.url_parse(href, maybeBase || null, componentsBuf.buffer);
  }

  function getSerialization(
    status: number,
    href: string,
    maybeBase?: string
  ): string {
    if (status === 0) {
      return href;
    } else if (status === 1) {
      return internals.url_serialize();
    } else {
      throw new TypeError(
        `Invalid URL: '${href}'` +
          (maybeBase ? ` with base '${maybeBase}'` : "")
      );
    }
  }

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
    noEscapeTable: Int8Array,
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
  const paramHexTable = hexTable.slice();
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
  function parseParams(qs: string): [string, string][] {
    const pairs: [string, string][] = [];
    let pair: [string, string] = ["", ""];
    let seenSep = false;
    let buf = "";
    let encoded = false;
    let encodeCheck = 0;
    let i = qs[0] === "?" ? 1 : 0;
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

        if (lastPos < i) buf += qs.slice(lastPos, i);
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
        if (lastPos < i) buf += qs.slice(lastPos, i);
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

  class URLSearchParams {
    [_list]: [string, string][];
    [_urlObject]: URL | null = null;

    constructor(
      init:
        | string
        | [string, string][]
        | Record<string, string>
        | undefined = undefined
    ) {
      const prefix = "Failed to construct 'URL'";
      init = webidl.converters[
        "sequence<sequence<USVString>> or record<USVString, USVString> or USVString"
      ]!(init, prefix, "Argument 1");
      // @ts-ignore
      this[webidl.brand] = webidl.brand;
      if (!init) {
        // if there is no query string, return early
        this[_list] = [];
        return;
      }

      if (typeof init === "string") {
        // Overload: USVString
        // If init is a string and starts with U+003F (?),
        // remove the first code point from init.
        if (init[0] == "?") {
          init = StringPrototypeSlice(init, 1);
        }
        this[_list] = parseParams(init);
      } else if (ArrayIsArray(init)) {
        // Overload: sequence<sequence<USVString>>
        this[_list] = ArrayPrototypeMap(init, (pair, i) => {
          if (pair.length !== 2) {
            throw new TypeError(
              `${prefix}: Item ${
                i + 0
              } in the parameter list does have length 2 exactly`
            );
          }
          return [pair[0], pair[1]];
        });
      } else {
        // Overload: record<USVString, USVString>
        this[_list] = ArrayPrototypeMap(ObjectKeys(init), (key) => [
          key,
          (init as Record<string, string>)[key]!,
        ]);
      }
    }

    #updateUrlSearch() {
      const url = this[_urlObject];
      if (url === null) {
        return;
      }
      // deno-lint-ignore prefer-primordials
      url[_updateUrlSearch](this.toString());
    }

    append(name: string, value: string) {
      webidl.assertBranded(this, URLSearchParamsPrototype);
      const prefix = "Failed to execute 'append' on 'URLSearchParams'";
      webidl.requiredArguments(arguments.length, 2, prefix);
      name = webidl.converters.USVString(name, prefix, "Argument 1");
      value = webidl.converters.USVString(value, prefix, "Argument 2");
      ArrayPrototypePush(this[_list], [name, value]);
      this.#updateUrlSearch();
    }

    delete(name: string, value?: string | undefined) {
      webidl.assertBranded(this, URLSearchParamsPrototype);
      const prefix = "Failed to execute 'append' on 'URLSearchParams'";
      webidl.requiredArguments(arguments.length, 1, prefix);
      name = webidl.converters.USVString(name, prefix, "Argument 1");
      const list = this[_list];
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
        value = webidl.converters.USVString(value, prefix, "Argument 2");
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
      webidl.assertBranded(this, URLSearchParamsPrototype);
      const prefix = "Failed to execute 'getAll' on 'URLSearchParams'";
      webidl.requiredArguments(arguments.length, 1, prefix);
      name = webidl.converters.USVString(name, prefix, "Argument 1");
      const values: string[] = [];
      const entries = this[_list];
      for (let i = 0; i < entries.length; ++i) {
        const entry = entries[i]!;
        if (entry[0] === name) {
          ArrayPrototypePush(values, entry[1]);
        }
      }
      return values;
    }

    get(name: string): string | null {
      webidl.assertBranded(this, URLSearchParamsPrototype);
      const prefix = "Failed to execute 'get' on 'URLSearchParams'";
      webidl.requiredArguments(arguments.length, 1, prefix);
      name = webidl.converters.USVString(name, prefix, "Argument 1");
      const entries = this[_list];
      for (let i = 0; i < entries.length; ++i) {
        const entry = entries[i]!;
        if (entry[0] === name) {
          return entry[1];
        }
      }
      return null;
    }

    has(name: string, value?: string | undefined): boolean {
      webidl.assertBranded(this, URLSearchParamsPrototype);
      const prefix = "Failed to execute 'has' on 'URLSearchParams'";
      webidl.requiredArguments(arguments.length, 1, prefix);
      name = webidl.converters.USVString(name, prefix, "Argument 1");
      if (value !== undefined) {
        value = webidl.converters.USVString(value, prefix, "Argument 2");
        return ArrayPrototypeSome(
          this[_list],
          (entry) => entry[0] === name && entry[1] === value
        );
      }
      return ArrayPrototypeSome(this[_list], (entry) => entry[0] === name);
    }

    set(name: string, value: string) {
      webidl.assertBranded(this, URLSearchParamsPrototype);
      const prefix = "Failed to execute 'set' on 'URLSearchParams'";
      webidl.requiredArguments(arguments.length, 2, prefix);
      name = webidl.converters.USVString(name, prefix, "Argument 1");
      value = webidl.converters.USVString(value, prefix, "Argument 2");

      const list = this[_list];

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
      webidl.assertBranded(this, URLSearchParamsPrototype);
      ArrayPrototypeSort(this[_list], (a, b) =>
        a[0] === b[0] ? 0 : a[0] > b[0] ? 1 : -1
      );
      this.#updateUrlSearch();
    }

    /**
     * @return {string}
     */
    toString() {
      webidl.assertBranded(this, URLSearchParamsPrototype);
      return serializeParams(this[_list]);
    }

    get size() {
      webidl.assertBranded(this, URLSearchParamsPrototype);
      return this[_list].length;
    }
  }

  webidl.mixinPairIterable("URLSearchParams", URLSearchParams, _list, 0, 1);

  webidl.configureInterface(URLSearchParams);
  const URLSearchParamsPrototype = URLSearchParams.prototype;

  webidl.converters["URLSearchParams"] = webidl.createInterfaceConverter(
    "URLSearchParams",
    URLSearchParamsPrototype
  );

  const _updateUrlSearch: unique symbol = Symbol("updateUrlSearch") as never;

  function trim(s: string) {
    if (s.length === 1) return "";
    return s;
  }

  // Represents a "no port" value. A port in URL cannot be greater than 2^16 - 1
  const NO_PORT = 65536;

  const skipInit = Symbol();
  const componentsBuf = new Uint32Array(8) as Uint32Array & {
    0: number;
    1: number;
    2: number;
    3: number;
    4: number;
    5: number;
    6: number;
    7: number;
  };

  class URL {
    #queryObject: URLSearchParams | null = null;
    #serialization!: string;
    #schemeEnd!: number;
    #usernameEnd!: number;
    #hostStart!: number;
    #hostEnd!: number;
    #port!: number;
    #pathStart!: number;
    #queryStart!: number;
    #fragmentStart!: number;

    [_updateUrlSearch](value: string) {
      this.#serialization = opUrlReparse(
        this.#serialization,
        SET_SEARCH,
        value
      );
      this.#updateComponents();
    }

    constructor(url: string | typeof skipInit, base?: string | undefined) {
      // skip initialization for URL.parse
      if (url === skipInit) {
        return;
      }
      const prefix = "Failed to construct 'URL'";
      webidl.requiredArguments(arguments.length, 1, prefix);
      url = webidl.converters.DOMString(url, prefix, "Argument 1");
      if (base !== undefined) {
        base = webidl.converters.DOMString(base, prefix, "Argument 2");
      }
      const status = opUrlParse(url, base);
      // @ts-ignore
      this[webidl.brand] = webidl.brand;
      this.#serialization = getSerialization(status, url, base);
      this.#updateComponents();
    }

    static parse(url: string, base?: string | undefined) {
      const prefix = "Failed to execute 'URL.parse'";
      webidl.requiredArguments(arguments.length, 1, prefix);
      url = webidl.converters.DOMString(url, prefix, "Argument 1");
      if (base !== undefined) {
        base = webidl.converters.DOMString(base, prefix, "Argument 2");
      }
      const status = opUrlParse(url, base);
      if (status !== 0 && status !== 1) {
        return null;
      }
      // If initialized with webidl.createBranded, private properties are not be accessible,
      // so it is passed through the constructor
      const self = new this(skipInit);
      // @ts-ignore
      self[webidl.brand] = webidl.brand;
      self.#serialization = getSerialization(status, url, base);
      self.#updateComponents();
      return self;
    }

    static canParse(url: string, base?: string | undefined) {
      const prefix = "Failed to execute 'URL.canParse'";
      webidl.requiredArguments(arguments.length, 1, prefix);
      url = webidl.converters.DOMString(url, prefix, "Argument 1");
      if (base !== undefined) {
        base = webidl.converters.DOMString(base, prefix, "Argument 2");
      }
      const status = opUrlParse(url, base);
      return status === 0 || status === 1;
    }

    #updateComponents() {
      ({
        0: this.#schemeEnd,
        1: this.#usernameEnd,
        2: this.#hostStart,
        3: this.#hostEnd,
        4: this.#port,
        5: this.#pathStart,
        6: this.#queryStart,
        7: this.#fragmentStart,
      } = componentsBuf);
    }

    #updateSearchParams() {
      if (this.#queryObject !== null) {
        const params = this.#queryObject[_list];
        const newParams = parseParams(StringPrototypeSlice(this.search, 1));
        ArrayPrototypeSplice(
          params,
          0,
          params.length,
          ...new SafeArrayIterator(newParams)
        );
      }
    }

    #hasAuthority() {
      // https://github.com/servo/rust-url/blob/1d307ae51a28fecc630ecec03380788bfb03a643/url/src/lib.rs#L824
      return StringPrototypeStartsWith(
        StringPrototypeSlice(this.#serialization, this.#schemeEnd),
        "://"
      );
    }

    get hash(): string {
      webidl.assertBranded(this, URLPrototype);
      // https://github.com/servo/rust-url/blob/1d307ae51a28fecc630ecec03380788bfb03a643/url/src/quirks.rs#L263
      return this.#fragmentStart
        ? trim(StringPrototypeSlice(this.#serialization, this.#fragmentStart))
        : "";
    }

    set hash(value: string) {
      webidl.assertBranded(this, URLPrototype);
      const prefix = "Failed to set 'hash' on 'URL'";
      webidl.requiredArguments(arguments.length, 1, prefix);
      value = webidl.converters.DOMString(value, prefix, "Argument 1");
      try {
        this.#serialization = opUrlReparse(
          this.#serialization,
          SET_HASH,
          value
        );
        this.#updateComponents();
      } catch {
        /* pass */
      }
    }

    /** @return {string} */
    get host() {
      webidl.assertBranded(this, URLPrototype);
      // https://github.com/servo/rust-url/blob/1d307ae51a28fecc630ecec03380788bfb03a643/url/src/quirks.rs#L101
      return StringPrototypeSlice(
        this.#serialization,
        this.#hostStart,
        this.#pathStart
      );
    }

    /** @param {string} value */
    set host(value) {
      webidl.assertBranded(this, URLPrototype);
      const prefix = "Failed to set 'host' on 'URL'";
      webidl.requiredArguments(arguments.length, 1, prefix);
      value = webidl.converters.DOMString(value, prefix, "Argument 1");
      try {
        this.#serialization = opUrlReparse(
          this.#serialization,
          SET_HOST,
          value
        );
        this.#updateComponents();
      } catch {
        /* pass */
      }
    }

    /** @return {string} */
    get hostname() {
      webidl.assertBranded(this, URLPrototype);
      // https://github.com/servo/rust-url/blob/1d307ae51a28fecc630ecec03380788bfb03a643/url/src/lib.rs#L988
      return StringPrototypeSlice(
        this.#serialization,
        this.#hostStart,
        this.#hostEnd
      );
    }

    /** @param {string} value */
    set hostname(value) {
      webidl.assertBranded(this, URLPrototype);
      const prefix = "Failed to set 'hostname' on 'URL'";
      webidl.requiredArguments(arguments.length, 1, prefix);
      value = webidl.converters.DOMString(value, prefix, "Argument 1");
      try {
        this.#serialization = opUrlReparse(
          this.#serialization,
          SET_HOSTNAME,
          value
        );
        this.#updateComponents();
      } catch {
        /* pass */
      }
    }

    /** @return {string} */
    get href() {
      webidl.assertBranded(this, URLPrototype);
      return this.#serialization;
    }

    /** @param {string} value */
    set href(value) {
      webidl.assertBranded(this, URLPrototype);
      const prefix = "Failed to set 'href' on 'URL'";
      webidl.requiredArguments(arguments.length, 1, prefix);
      value = webidl.converters.DOMString(value, prefix, "Argument 1");
      const status = opUrlParse(value);
      this.#serialization = getSerialization(status, value);
      this.#updateComponents();
      this.#updateSearchParams();
    }

    get origin(): string {
      webidl.assertBranded(this, URLPrototype);
      // https://github.com/servo/rust-url/blob/1d307ae51a28fecc630ecec03380788bfb03a643/url/src/origin.rs#L14
      const scheme = StringPrototypeSlice(
        this.#serialization,
        0,
        this.#schemeEnd
      );
      if (
        scheme === "http" ||
        scheme === "https" ||
        scheme === "ftp" ||
        scheme === "ws" ||
        scheme === "wss"
      ) {
        return `${scheme}://${this.host}`;
      }

      if (scheme === "blob") {
        // TODO(@littledivy): Fast path.
        try {
          return new URL(this.pathname).origin;
        } catch {
          return "null";
        }
      }

      return "null";
    }

    get password(): string {
      webidl.assertBranded(this, URLPrototype);
      // https://github.com/servo/rust-url/blob/1d307ae51a28fecc630ecec03380788bfb03a643/url/src/lib.rs#L914
      if (
        this.#hasAuthority() &&
        this.#usernameEnd !== this.#serialization.length &&
        this.#serialization[this.#usernameEnd] === ":"
      ) {
        return StringPrototypeSlice(
          this.#serialization,
          this.#usernameEnd + 1,
          this.#hostStart - 1
        );
      }
      return "";
    }

    set password(value: string) {
      webidl.assertBranded(this, URLPrototype);
      const prefix = "Failed to set 'password' on 'URL'";
      webidl.requiredArguments(arguments.length, 1, prefix);
      value = webidl.converters.DOMString(value, prefix, "Argument 1");
      try {
        this.#serialization = opUrlReparse(
          this.#serialization,
          SET_PASSWORD,
          value
        );
        this.#updateComponents();
      } catch {
        /* pass */
      }
    }

    get pathname(): string {
      webidl.assertBranded(this, URLPrototype);
      // https://github.com/servo/rust-url/blob/1d307ae51a28fecc630ecec03380788bfb03a643/url/src/lib.rs#L1203
      if (!this.#queryStart && !this.#fragmentStart) {
        return StringPrototypeSlice(this.#serialization, this.#pathStart);
      }

      const nextComponentStart = this.#queryStart || this.#fragmentStart;
      return StringPrototypeSlice(
        this.#serialization,
        this.#pathStart,
        nextComponentStart
      );
    }

    set pathname(value: string) {
      webidl.assertBranded(this, URLPrototype);
      const prefix = "Failed to set 'pathname' on 'URL'";
      webidl.requiredArguments(arguments.length, 1, prefix);
      value = webidl.converters.DOMString(value, prefix, "Argument 1");
      try {
        this.#serialization = opUrlReparse(
          this.#serialization,
          SET_PATHNAME,
          value
        );
        this.#updateComponents();
      } catch {
        /* pass */
      }
    }

    get port(): string {
      webidl.assertBranded(this, URLPrototype);
      // https://github.com/servo/rust-url/blob/1d307ae51a28fecc630ecec03380788bfb03a643/url/src/quirks.rs#L196
      if (this.#port === NO_PORT) {
        return StringPrototypeSlice(
          this.#serialization,
          this.#hostEnd,
          this.#pathStart
        );
      } else {
        return StringPrototypeSlice(
          this.#serialization,
          this.#hostEnd + 1 /* : */,
          this.#pathStart
        );
      }
    }

    set port(value: string) {
      webidl.assertBranded(this, URLPrototype);
      const prefix = "Failed to set 'port' on 'URL'";
      webidl.requiredArguments(arguments.length, 1, prefix);
      value = webidl.converters.DOMString(value, prefix, "Argument 1");
      try {
        this.#serialization = opUrlReparse(
          this.#serialization,
          SET_PORT,
          value
        );
        this.#updateComponents();
      } catch {
        /* pass */
      }
    }

    get protocol(): string {
      webidl.assertBranded(this, URLPrototype);
      // https://github.com/servo/rust-url/blob/1d307ae51a28fecc630ecec03380788bfb03a643/url/src/quirks.rs#L56
      return StringPrototypeSlice(
        this.#serialization,
        0,
        this.#schemeEnd + 1 /* : */
      );
    }

    set protocol(value: string) {
      webidl.assertBranded(this, URLPrototype);
      const prefix = "Failed to set 'protocol' on 'URL'";
      webidl.requiredArguments(arguments.length, 1, prefix);
      value = webidl.converters.DOMString(value, prefix, "Argument 1");
      try {
        this.#serialization = opUrlReparse(
          this.#serialization,
          SET_PROTOCOL,
          value
        );
        this.#updateComponents();
      } catch {
        /* pass */
      }
    }

    get search(): string {
      webidl.assertBranded(this, URLPrototype);
      // https://github.com/servo/rust-url/blob/1d307ae51a28fecc630ecec03380788bfb03a643/url/src/quirks.rs#L249
      const afterPath =
        this.#queryStart || this.#fragmentStart || this.#serialization.length;
      const afterQuery = this.#fragmentStart || this.#serialization.length;
      return trim(
        StringPrototypeSlice(this.#serialization, afterPath, afterQuery)
      );
    }

    set search(value: string) {
      webidl.assertBranded(this, URLPrototype);
      const prefix = "Failed to set 'search' on 'URL'";
      webidl.requiredArguments(arguments.length, 1, prefix);
      value = webidl.converters.DOMString(value, prefix, "Argument 1");
      try {
        this.#serialization = opUrlReparse(
          this.#serialization,
          SET_SEARCH,
          value
        );
        this.#updateComponents();
        this.#updateSearchParams();
      } catch {
        /* pass */
      }
    }

    get username(): string {
      webidl.assertBranded(this, URLPrototype);
      // https://github.com/servo/rust-url/blob/1d307ae51a28fecc630ecec03380788bfb03a643/url/src/lib.rs#L881
      const schemeSeparatorLen = 3; /* :// */
      if (
        this.#hasAuthority() &&
        this.#usernameEnd > this.#schemeEnd + schemeSeparatorLen
      ) {
        return StringPrototypeSlice(
          this.#serialization,
          this.#schemeEnd + schemeSeparatorLen,
          this.#usernameEnd
        );
      } else {
        return "";
      }
    }

    set username(value: string) {
      webidl.assertBranded(this, URLPrototype);
      const prefix = "Failed to set 'username' on 'URL'";
      webidl.requiredArguments(arguments.length, 1, prefix);
      value = webidl.converters.DOMString(value, prefix, "Argument 1");
      try {
        this.#serialization = opUrlReparse(
          this.#serialization,
          SET_USERNAME,
          value
        );
        this.#updateComponents();
      } catch {
        /* pass */
      }
    }

    get searchParams(): URLSearchParams {
      if (this.#queryObject == null) {
        this.#queryObject = new URLSearchParams(this.search);
        this.#queryObject[_urlObject] = this;
      }
      return this.#queryObject;
    }

    toString(): string {
      webidl.assertBranded(this, URLPrototype);
      return this.#serialization;
    }

    toJSON(): string {
      webidl.assertBranded(this, URLPrototype);
      return this.#serialization;
    }
  }

  webidl.configureInterface(URL);
  const URLPrototype = URL.prototype;

  webidl.converters[
    "sequence<sequence<USVString>> or record<USVString, USVString> or USVString"
  ] = (V, prefix, context, opts) => {
    // Union for (sequence<sequence<USVString>> or record<USVString, USVString> or USVString)
    if (webidl.type(V) === "Object" && V !== null) {
      if (V[SymbolIterator] !== undefined) {
        return webidl.converters["sequence<sequence<USVString>>"]!(
          V,
          prefix,
          context,
          opts
        );
      }
      return webidl.converters["record<USVString, USVString>"]!(
        V,
        prefix,
        context,
        opts
      );
    }
    return webidl.converters.USVString(V, prefix, context, opts);
  };
  return { URL, URLSearchParams };
}
