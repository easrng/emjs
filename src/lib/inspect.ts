import { primordials, primordialUtils } from "emjs:internal/internals";

const {
  NumberNEGATIVE_INFINITY,
  NumberPOSITIVE_INFINITY,
  RegExpPrototypeTest,
  MathFloor,
  String,
  StringPrototypeSlice,
  RegExpPrototypeSymbolReplace,
  TypeError,
  ArrayPrototypeJoin,
  SymbolPrototypeToString,
  ArrayIsArray,
  ObjectPrototypePropertyIsEnumerable,
  ArrayPrototypeConcat,
  SymbolFor,
  FunctionPrototypeCall,
  FunctionPrototypeSymbolHasInstance,
  Error,
  Date,
  RegExp,
  Number,
  Boolean,
  Symbol,
  BigInt,
  ObjectHasOwn,
  ObjectPrototypeToString,
  MapPrototypeForEach,
  MapPrototypeGetSize,
  SetPrototypeForEach,
  SetPrototypeGetSize,
  BigIntPrototypeValueOf,
  BooleanPrototypeValueOf,
  globalThis,
  ObjectPrototype,
  ObjectGetPrototypeOf,
  Function,
  FunctionPrototypeToString,
  RegExpPrototypeSymbolMatch,
  Set,
  SetPrototypeHas,
  SetPrototypeAdd,
  Map,
  StringPrototypeToUpperCase,
  StringPrototypeRepeat,
  StringPrototypeIndexOf,
  ObjectGetOwnPropertySymbols,
  WeakMap,
  WeakSet,
  ArrayPrototypePush,
  StringPrototypeCharCodeAt,
  NumberPrototypeToString,
} = primordials;
const { SafeSetIterator } = primordialUtils;

function addNumericSeparator(num: bigint | number, str: string) {
  if (
    num === NumberPOSITIVE_INFINITY ||
    num === NumberNEGATIVE_INFINITY ||
    num !== num ||
    (num && num > -1000 && num < 1000) ||
    RegExpPrototypeTest(/e/, str)
  ) {
    return str;
  }
  const sepRegex = /[0-9](?=(?:[0-9]{3})+(?![0-9]))/g;
  if (typeof num === "number") {
    const int = num < 0 ? -MathFloor(-num) : MathFloor(num); // trunc(num)
    if (int !== num) {
      const intStr = String(int);
      const dec = StringPrototypeSlice(str, intStr.length + 1);
      return (
        RegExpPrototypeSymbolReplace(sepRegex, intStr, "$&_") +
        "." +
        RegExpPrototypeSymbolReplace(
          /_$/,
          RegExpPrototypeSymbolReplace(/([0-9]{3})/g, dec, "$&_"),
          ""
        )
      );
    }
  }
  return RegExpPrototypeSymbolReplace(sepRegex, str, "$&_");
}

interface InspectOptions {
  /**
   * Maximum depth of the inspection. Default: `5`.
   */
  depth?: number | null | undefined;
  /**
   * Must be 0, a positive integer, Infinity, or null, if present. Default `10000`.
   */
  maxStringLength?: number | null | undefined;
  /**
   * When true, a custom inspect method function will be invoked under the well-known `nodejs.util.inspect.custom` symbol. Default true.
   */
  customInspect?: boolean | undefined;
  /**
   * Must be "\t", null, or a positive integer. Default null.
   */
  indent?: number | "\t" | null | undefined;
  /**
   * Must be a boolean, if present. Default false. If true, all numbers will be printed with numeric separators (eg, 1234.5678 will be printed as '1_234.567_8')
   */
  numericSeparator?: boolean | undefined;
  /**
   * Colorize output. Default false.
   */
  colors?: boolean;
}

export { inspect_ as inspect };

const customInspectSymbol: unique symbol = SymbolFor(
  "nodejs.util.inspect.custom"
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
) as any;

function inspect_(
  obj: unknown,
  options?: InspectOptions,
  depth?: number,
  seen?: primordials.Set<unknown>
): string {
  const opts = options || {};

  if (
    ObjectHasOwn(opts, "maxStringLength") &&
    (typeof opts.maxStringLength === "number"
      ? opts.maxStringLength < 0 &&
        opts.maxStringLength !== NumberPOSITIVE_INFINITY
      : opts.maxStringLength != null)
  ) {
    throw new TypeError(
      'option "maxStringLength", if provided, must be a positive integer, Infinity, or `null`'
    );
  }
  const customInspect = ObjectHasOwn(opts, "customInspect")
    ? opts.customInspect
    : true;
  if (typeof customInspect !== "boolean" && customInspect !== "symbol") {
    throw new TypeError(
      "option \"customInspect\", if provided, must be `true`, `false`, or `'symbol'`"
    );
  }

  if (
    ObjectHasOwn(opts, "indent") &&
    opts.indent != null &&
    opts.indent !== "\t" &&
    !(MathFloor(opts.indent) === opts.indent && opts.indent > 0)
  ) {
    throw new TypeError(
      'option "indent" must be "\\t", an integer > 0, or `null`'
    );
  }
  if (
    ObjectHasOwn(opts, "numericSeparator") &&
    typeof opts.numericSeparator !== "boolean"
  ) {
    throw new TypeError(
      'option "numericSeparator", if provided, must be `true` or `false`'
    );
  }
  const numericSeparator = opts.numericSeparator;

  if (typeof obj === "undefined") {
    return "undefined";
  }
  if (obj === null) {
    return "null";
  }
  if (typeof obj === "boolean") {
    return obj ? "true" : "false";
  }

  if (typeof obj === "string") {
    return inspectString(obj, opts);
  }
  if (typeof obj === "number") {
    if (obj === 0) {
      return NumberPOSITIVE_INFINITY / obj > 0 ? "0" : "-0";
    }
    const str = String(obj);
    return numericSeparator ? addNumericSeparator(obj, str) : str;
  }
  if (typeof obj === "bigint") {
    const bigIntStr = String(obj) + "n";
    return numericSeparator ? addNumericSeparator(obj, bigIntStr) : bigIntStr;
  }

  const maxDepth = opts.depth == null ? 5 : opts.depth;
  if (typeof depth === "undefined") {
    depth = 0;
  }
  if (depth >= maxDepth && maxDepth > 0 && typeof obj === "object") {
    return ArrayIsArray(obj) ? "[Array]" : "[Object]";
  }

  const indent = getIndent(opts, depth);

  if (typeof seen === "undefined") {
    seen = new Set();
  } else if (SetPrototypeHas(seen, obj)) {
    return "[Circular]";
  }

  function inspect(value: unknown, from?: unknown, noIndent?: boolean): string {
    if (from) {
      seen = new Set(new SafeSetIterator(seen!));
      SetPrototypeAdd(seen, from);
    }
    if (noIndent) {
      const newOpts: InspectOptions = {
        depth: opts.depth,
      };
      return inspect_(value, newOpts, depth! + 1, seen);
    }
    return inspect_(value, opts, depth! + 1, seen);
  }

  if (typeof obj === "function" && !isRegExp(obj)) {
    // in older engines, regexes are callable
    const name = nameOf(obj);
    const keys = arrObjKeys(obj, inspect);
    return (
      "[Function" +
      (name ? ": " + name : " (anonymous)") +
      "]" +
      (keys.length > 0 ? " { " + ArrayPrototypeJoin(keys, ", ") + " }" : "")
    );
  }
  if (isSymbol(obj)) {
    const symString = SymbolPrototypeToString(obj);
    return typeof obj === "object" ? markBoxed(symString) : symString;
  }
  if (ArrayIsArray(obj)) {
    if (obj.length === 0) {
      return "[]";
    }
    const xs = arrObjKeys(obj, inspect);
    if (indent && !singleLineValues(xs)) {
      return "[" + indentedJoin(xs, indent) + "]";
    }
    return "[ " + ArrayPrototypeJoin(xs, ", ") + " ]";
  }
  if (isError(obj)) {
    const parts = arrObjKeys(obj, inspect);
    if ("cause" in obj && !ObjectPrototypePropertyIsEnumerable(obj, "cause")) {
      return (
        "{ [" +
        String(obj) +
        "] " +
        ArrayPrototypeJoin(
          ArrayPrototypeConcat("[cause]: " + inspect(obj.cause), parts),
          ", "
        ) +
        " }"
      );
    }
    if (parts.length === 0) {
      return "[" + String(obj) + "]";
    }
    return "{ [" + String(obj) + "] " + ArrayPrototypeJoin(parts, ", ") + " }";
  }
  if (typeof obj === "object" && customInspect) {
    if (customInspect && customInspectSymbol in obj) {
      const fn = (obj as { [customInspectSymbol]?(): string })[
        customInspectSymbol
      ];
      if (typeof fn === "function") {
        return FunctionPrototypeCall(
          fn,
          obj,
          depth,
          {
            customInspect,
            depth: maxDepth,
            maxStringLength: opts.maxStringLength,
            numericSeparator,
          },
          inspect_
        );
      }
    }
  }
  if (isMap(obj)) {
    const mapParts: string[] = [];
    MapPrototypeForEach(obj, function (value, key) {
      ArrayPrototypePush(
        mapParts,
        inspect(key, obj, true) + " => " + inspect(value, obj)
      );
    });
    return collectionOf("Map", MapPrototypeGetSize(obj), mapParts, indent);
  }
  if (isSet(obj)) {
    const setParts: string[] = [];
    SetPrototypeForEach(obj, function (value) {
      ArrayPrototypePush(setParts, inspect(value, obj));
    });
    return collectionOf("Set", SetPrototypeGetSize(obj), setParts, indent);
  }
  if (isWeakMap(obj)) {
    return weakCollectionOf("WeakMap");
  }
  if (isWeakSet(obj)) {
    return weakCollectionOf("WeakSet");
  }
  // if (isWeakRef(obj)) {
  //   return weakCollectionOf("WeakRef");
  // }
  if (isNumber(obj)) {
    return markBoxed(inspect(Number(obj)));
  }
  if (isBigInt(obj)) {
    return markBoxed(inspect(BigIntPrototypeValueOf(obj)));
  }
  if (isBoolean(obj)) {
    return markBoxed(BooleanPrototypeValueOf(obj) === true ? "true" : "false");
  }
  if (isString(obj)) {
    return markBoxed(inspect(String(obj)));
  }
  if (obj === globalThis) {
    return "{ [object globalThis] }";
  }
  if (!isDate(obj) && !isRegExp(obj)) {
    const ys = arrObjKeys(obj, inspect);
    const proto = ObjectGetPrototypeOf(obj);
    const isPlainObject = proto === ObjectPrototype;
    const protoTag = proto === null ? "null prototype" : "";
    const stringTag =
      !isPlainObject &&
      typeof obj === "object" &&
      primordials.SymbolToStringTag in obj
        ? StringPrototypeSlice(ObjectPrototypeToString(obj), 8, -1)
        : protoTag
        ? "Object"
        : "";
    const constructorTag =
      isPlainObject || typeof obj.constructor !== "function"
        ? ""
        : obj.constructor.name
        ? obj.constructor.name + " "
        : "";
    const tag =
      constructorTag +
      (stringTag || protoTag
        ? "[" +
          ArrayPrototypeJoin(
            ArrayPrototypeConcat([], stringTag || [], protoTag || []),
            ": "
          ) +
          "] "
        : "");
    if (ys.length === 0) {
      return tag + "{}";
    }
    if (indent) {
      return tag + "{" + indentedJoin(ys, indent) + "}";
    }
    return tag + "{ " + ArrayPrototypeJoin(ys, ", ") + " }";
  }
  return String(obj);
}

function wrapQuotes(s: string) {
  const quoteChar = "'";
  return quoteChar + s + quoteChar;
}

function isDate(obj: unknown): obj is InstanceType<typeof Date> {
  return FunctionPrototypeSymbolHasInstance(Date, obj);
}
function isRegExp(obj: unknown): obj is InstanceType<typeof RegExp> {
  return FunctionPrototypeSymbolHasInstance(RegExp, obj);
}
function isError(obj: unknown): obj is InstanceType<typeof Error> {
  return FunctionPrototypeSymbolHasInstance(Error, obj);
}
function isString(obj: unknown): obj is InstanceType<typeof String> {
  return FunctionPrototypeSymbolHasInstance(String, obj);
}
function isNumber(obj: unknown): obj is InstanceType<typeof Number> {
  return FunctionPrototypeSymbolHasInstance(Number, obj);
}
function isBoolean(obj: unknown): obj is InstanceType<typeof Boolean> {
  return FunctionPrototypeSymbolHasInstance(Boolean, obj);
}
function isMap(obj: unknown): obj is InstanceType<typeof Map> {
  return FunctionPrototypeSymbolHasInstance(Map, obj);
}
function isSet(obj: unknown): obj is InstanceType<typeof Set> {
  return FunctionPrototypeSymbolHasInstance(Set, obj);
}
function isWeakMap(obj: unknown): obj is InstanceType<typeof WeakMap> {
  return FunctionPrototypeSymbolHasInstance(WeakMap, obj);
}
function isWeakSet(obj: unknown): obj is InstanceType<typeof WeakSet> {
  return FunctionPrototypeSymbolHasInstance(WeakSet, obj);
}
// function isWeakRef(obj: unknown): obj is InstanceType<typeof WeakRef> {
//   return FunctionPrototypeSymbolHasInstance(WeakRef, obj);
// }
function isSymbol(obj: unknown): obj is primordials.Symbol | symbol {
  return (
    typeof obj === "symbol" || FunctionPrototypeSymbolHasInstance(Symbol, obj)
  );
}
function isBigInt(obj: unknown): obj is primordials.BigInt {
  return FunctionPrototypeSymbolHasInstance(BigInt, obj);
}

function nameOf(f: InstanceType<typeof Function>) {
  if (f.name) {
    return f.name;
  }
  const m = RegExpPrototypeSymbolMatch(
    /^(function|class)\s*([\w$]+)/,
    FunctionPrototypeToString(f)
  );
  if (m) {
    return m[1];
  }
  return null;
}

const quoteRE = /(['\\])/g;

function inspectString(str: string, opts: InspectOptions): string {
  if (opts.maxStringLength != null && str.length > opts.maxStringLength) {
    const remaining = str.length - opts.maxStringLength;
    const trailer =
      "... " + remaining + " more character" + (remaining > 1 ? "s" : "");
    return (
      inspectString(StringPrototypeSlice(str, 0, opts.maxStringLength), opts) +
      trailer
    );
  }
  quoteRE.lastIndex = 0;
  const s = RegExpPrototypeSymbolReplace(
    // eslint-disable-next-line no-control-regex
    /[\x00-\x1f]/g,
    RegExpPrototypeSymbolReplace(quoteRE, str, "\\$1"),
    lowbyte
  );
  return wrapQuotes(s);
}

function lowbyte(c: string) {
  const n = StringPrototypeCharCodeAt(c, 0);
  const x = {
    8: "b",
    9: "t",
    10: "n",
    12: "f",
    13: "r",
  }[n];
  if (x) {
    return "\\" + x;
  }
  return (
    "\\x" +
    (n < 0x10 ? "0" : "") +
    StringPrototypeToUpperCase(NumberPrototypeToString(n, 16))
  );
}

function markBoxed(str: string) {
  return "Object(" + str + ")";
}

function weakCollectionOf(type: string) {
  return type + " { ? }";
}

function collectionOf(
  type: string,
  size: number,
  entries: string[],
  indent: {
    base: string;
    prev: string;
  } | null
) {
  const joinedEntries = indent
    ? indentedJoin(entries, indent)
    : ArrayPrototypeJoin(entries, ", ");
  return type + " (" + size + ") {" + joinedEntries + "}";
}

function singleLineValues(xs: string[]) {
  for (let i = 0; i < xs.length; i++) {
    if (StringPrototypeIndexOf(xs[i], "\n") >= 0) {
      return false;
    }
  }
  return true;
}

function getIndent(opts: InspectOptions, depth: number) {
  let baseIndent;
  if (opts.indent === "\t") {
    baseIndent = "\t";
  } else if (typeof opts.indent === "number" && opts.indent > 0) {
    baseIndent = StringPrototypeRepeat(" ", opts.indent);
  } else {
    return null;
  }
  return {
    base: baseIndent,
    prev: StringPrototypeRepeat(baseIndent, depth),
  };
}

function indentedJoin(
  xs: string[],
  indent: {
    base: string;
    prev: string;
  }
) {
  if (xs.length === 0) {
    return "";
  }
  const lineJoiner = "\n" + indent.prev + indent.base;
  return (
    lineJoiner + ArrayPrototypeJoin(xs, "," + lineJoiner) + "\n" + indent.prev
  );
}

function arrObjKeys(
  obj_: object,
  inspect: (value: unknown, from?: unknown, noIndent?: boolean) => string
) {
  const obj = obj_ as Record<PropertyKey, unknown>;
  const isArr = ArrayIsArray(obj);
  const xs = [];
  if (isArr) {
    xs.length = obj.length;
    for (let i = 0; i < obj.length; i++) {
      xs[i] = ObjectHasOwn(obj, i) ? inspect(obj[i], obj) : "";
    }
  }
  const syms = ObjectGetOwnPropertySymbols(obj);

  for (const key in obj) {
    if (!ObjectHasOwn(obj, key)) {
      continue;
    }
    if (isArr && String(Number(key)) === key && Number(key) < obj.length) {
      continue;
    }
    if (RegExpPrototypeTest(/[^\w$]/, key)) {
      ArrayPrototypePush(xs, inspect(key, obj) + ": " + inspect(obj[key], obj));
    } else {
      ArrayPrototypePush(xs, key + ": " + inspect(obj[key], obj));
    }
  }
  for (let j = 0; j < syms.length; j++) {
    if (ObjectPrototypePropertyIsEnumerable(obj, syms[j]!)) {
      ArrayPrototypePush(
        xs,
        "[" + inspect(syms[j]) + "]: " + inspect(obj[syms[j]!], obj)
      );
    }
  }
  return xs;
}
