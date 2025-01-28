/* eslint-disable no-restricted-syntax */
/* eslint-disable no-restricted-globals */
/* global console */

/** @typedef {string | {type?: boolean; as?: string; name: string}} Export */

// Methods that accept a variable number of arguments, and thus it's useful to
// also create `${prefix}${key}Apply`, which uses `Function.prototype.apply`,
// instead of `Function.prototype.call`, and thus doesn't require iterator
// destructuring.
const varargsMethods = [
  // 'ArrayPrototypeConcat' is omitted, because it performs the spread
  // on its own for arrays and array-likes with a truthy
  // @@isConcatSpreadable symbol property.
  "ArrayOf",
  "ArrayPrototypePush",
  "ArrayPrototypeUnshift",
  // 'FunctionPrototypeCall' is omitted, since there's 'ReflectApply'
  // and 'FunctionPrototypeApply'.
  "MathHypot",
  "MathMax",
  "MathMin",
  "StringPrototypeConcat",
  "TypedArrayOf",
];
/**
 * @param {string} description
 */
function formatSymbol(description) {
  // Remove 'Symbol.' prefix and capitalize
  return `Symbol${description
    .slice(description.startsWith("Symbol.") ? 7 : 0)
    .split(".")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join("")}`;
}

/**
 * @param {string | symbol} key
 */
function getNewKey(key) {
  if (typeof key === "symbol")
    return formatSymbol(/** @type {string} */ (key.description));
  return `${key.charAt(0).toUpperCase()}${key.slice(1)}`;
}

/**
 * @param {string | symbol} key
 */
function indexWith(key) {
  if (typeof key === "string") return "." + key;
  if (!key.description?.startsWith("Symbol."))
    throw new Error("not well known symbol");
  return `[${formatSymbol(key.description)}]`;
}

const define = (
  /** @type {string} */ name,
  /** @type {string} */ val,
  /** @type {string | undefined} */ t
) => `const ${name}${t ? ": " + t : ""} = ${val};`;

/**
 * Creates a new object that contains properties and methods from a source
 * object or function, including its prototype properties, with a specified
 * prefix for the property names.
 *
 * @param {unknown} src - The source object or function from which to
 *        copy properties. If it's not an object or function, its value will be
 *        directly assigned to the destination object.
 * @param {string} name - The prefix used for the property names in
 *        the destination object. Defaults to the name property of the source
 *        if not provided.
 * @param {string} path - The prefix used for the property names in
 *        the destination object. Defaults to the name property of the source
 *        if not provided.
 * @param {string[]} dest - The destination object where properties will be
 *        copied. If not provided, a new object will be created.
 *
 * @param {Export[]} exports
 *
 * @returns {void} The destination object containing the copied properties
 *                  from the source.
 */
function getPrimordial(src, name, path, dest, exports) {
  const copyProperties = (
    /** @type {object} */ source,
    /** @type {string} */ prefix,
    /** @type {string} */ path,
    isPrototype = false
  ) => {
    if (isPrototype) prefix += "Prototype";

    for (const key of Reflect.ownKeys(source)) {
      if (key.toString().startsWith("__")) continue;
      if (source === Symbol && key === "operatorSet") continue;
      if (source === Set && key === "groupBy") continue;
      if (source === Reflect && key === "getOwnPropertyDescriptor") continue;
      if (
        prefix === "PromisePrototype" &&
        (key === "catch" || key === "finally")
      )
        continue;
      if (source === BigInt && /^(.div|ctz|floor|sqrt)/.test(key.toString()))
        continue;
      if (
        prefix === "DatePrototype" &&
        (key === "toGMTString" || key === "getYear" || key === "setYear")
      )
        continue;
      if (prefix === "ArrayPrototype" && key === "map") continue;
      if (
        ((key === "length" || key === "name") &&
          typeof source === "function") ||
        (isPrototype && key === "constructor")
      )
        continue;
      const newKey = getNewKey(key);
      const desc = /** @type {PropertyDescriptor} */ (
        Reflect.getOwnPropertyDescriptor(source, key)
      );

      if ("get" in desc || "set" in desc) {
        dest.push(
          define(
            `${prefix}${newKey}Descriptor`,
            `ReflectGetOwnPropertyDescriptor(${path}, ${
              typeof key === "string"
                ? `'${key}'`
                : formatSymbol(/** @type {string} */ (key.description))
            })!`
          )
        );
        if (desc.get) {
          dest.push(
            define(
              `${prefix}Get${newKey}`,
              `uncurryThis(${prefix}${newKey}Descriptor.get!)`
            )
          );
          exports.push(`${prefix}Get${newKey}`);
        }
        if (desc.set) {
          dest.push(
            define(
              `${prefix}Set${newKey}`,
              `uncurryThis(${prefix}${newKey}Descriptor.set!)`
            )
          );
          exports.push(`${prefix}Set${newKey}`);
        }
      } else {
        const newName = `${prefix}${newKey}`;
        exports.push(newName);
        if (isPrototype && typeof desc.value === "function") {
          dest.push(
            define(`${newName}`, `uncurryThis(${path + indexWith(key)})`)
          );
          if (varargsMethods.includes(newName)) {
            dest.push(
              define(`${newName}Apply`, `applyBind(${path + indexWith(key)})`)
            );
            exports.push(newName + "Apply");
          }
        } else {
          dest.push(
            define(
              `${newName}`,
              `${path + indexWith(key)}${
                src === Promise && typeof desc.value === "function"
                  ? ".bind(Promise)"
                  : ""
              }`,
              src === Symbol && typeof desc.value === "symbol"
                ? `typeof ${desc.value.description}`
                : undefined
            )
          );
        }
      }
    }
  };

  dest.push(define(`$${name}`, path));
  exports.push({ name: `$${name}`, as: name });

  // Handle non-function, non-object sources
  if (
    src === null ||
    src === globalThis ||
    (typeof src !== "function" &&
      (typeof src !== "object" || !("constructor" in src && src.constructor)))
  ) {
    return;
  }

  copyProperties(src, name, "$" + name);

  // Copy prototype properties
  if ("prototype" in src && src.prototype)
    copyProperties(src.prototype, name, `${name}Prototype`, true);
}

/**
 * @type {Export[]}
 */
const exports = [
  "uncurryThis",
  {
    type: true,
    name: "$Iterator",
    as: "Iterator",
  },
  "ReflectGetOwnPropertyDescriptor"
];

/**
 * @type {string[]}
 */
const primordials = [
  String.raw`// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
type ToObject<T extends object> = {
  [K in keyof T]: T[K];
};
interface AddSignature<
  T extends object,
  Params extends readonly unknown[],
  Return,
  This
> extends T {
  (this: This, ...args: Params): Return;
}
type _UncurryThis<
  T extends (...args: never[]) => unknown,
  Shape extends object = ToObject<T>,
  // This would be the first part to change if you want to change the return type.
  Signatures extends [
    unknown,
    readonly unknown[],
    readonly unknown[],
    unknown
  ][] = []
> = Shape extends T
  ? Signatures
  : T extends AddSignature<Shape, infer Params, infer Return, infer This>
  ? _UncurryThis<
      T,
      AddSignature<Shape, Params, Return, This>,
      [[This, Params, [This, ...Params], Return], ...Signatures]
    >
  : Signatures;
// eslint-disable-next-line no-restricted-globals
const { apply, bind, call } = Function.prototype;
// eslint-disable-next-line no-restricted-syntax
const uncurryThis = bind.bind(call) as <
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  T extends (this: any, ...args: any[]) => unknown
>(
  fn: T
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
) => false extends (any extends T ? true : false)
  ? (...args: _UncurryThis<T>[number][2]) => _UncurryThis<T>[number][3]
  : // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (...args: any[]) => any;
// eslint-disable-next-line no-restricted-syntax
const applyBind = bind.bind(apply) as <
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  T extends (this: any, ...args: any[]) => unknown
>(
  fn: T
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
) => false extends (any extends T ? true : false)
  ? (
      self: _UncurryThis<T>[number][0],
      args: _UncurryThis<T>[number][1]
    ) => _UncurryThis<T>[number][3]
  : // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (self: any, args: any[]) => any;

declare global {
  abstract class Reflect {
    // eslint-disable-next-line no-restricted-globals
    static [Symbol.toStringTag]: "Reflect";
  }
}

/* eslint-disable no-restricted-globals */
/* eslint-disable no-restricted-syntax */
type $Iterator<T, TReturn = unknown, TNext = undefined> = Iterator<T, TReturn, TNext>
type $Array<T> = Array<T>;
type $Uint8Array = Uint8Array;
// type $FinalizationRegistry<T> = FinalizationRegistry<T>;
type $Map<K, V> = Map<K, V>;
type $Set<T> = Set<T>;
type $WeakMap<K extends WeakKey, V> = WeakMap<K, V>;
// type $WeakRef<T extends WeakKey> = WeakRef<T>;
type $WeakSet<T extends WeakKey> = WeakSet<T>;
type $Promise<T> = Promise<T>;
type $ArrayBuffer = ArrayBuffer;
const ReflectGetOwnPropertyDescriptor = Reflect.getOwnPropertyDescriptor;
// eslint-disable-next-line @typescript-eslint/no-wrapper-object-types
type $Symbol = Symbol;
// eslint-disable-next-line @typescript-eslint/no-wrapper-object-types
type $BigInt = BigInt;
`,
];

getPrimordial(Symbol, "Symbol", "Symbol", primordials, exports);
for (const name of [
  "globalThis",
  "isNaN",
  "decodeURI",
  "decodeURIComponent",
  "encodeURI",
  "encodeURIComponent",
  "JSON",
  "Math",
  "Proxy",
  "Reflect",
  "AggregateError",
  "Array",
  "ArrayBuffer",
  "BigInt",
  "BigInt64Array",
  "BigUint64Array",
  "Boolean",
  "DataView",
  "Date",
  "Error",
  "EvalError",
  "FinalizationRegistry",
  "Float32Array",
  "Float64Array",
  "Function",
  "Int16Array",
  "Int32Array",
  "Int8Array",
  "Map",
  "Number",
  "Object",
  "RangeError",
  "ReferenceError",
  "RegExp",
  "Set",
  "SharedArrayBuffer",
  "String",
  "SyntaxError",
  "TypeError",
  "URIError",
  "Uint16Array",
  "Uint32Array",
  "Uint8Array",
  "Uint8ClampedArray",
  "WeakMap",
  "WeakRef",
  "WeakSet",
  "Promise",
]) {
  if (!(name in globalThis)) continue;
  getPrimordial(
    globalThis[/** @type {keyof globalThis} */ (name)],
    name,
    name,
    primordials,
    exports
  );
}

primordials.push(
  `\nexport {\n${exports
    .map((e) =>
      typeof e === "string"
        ? e
        : `${e.type ? "type " : ""}${e.name}${e.as ? " as " + e.as : ""}`
    )
    .join(",\n")}\n}\nexport default {\n${exports
    .flatMap((e) =>
      typeof e === "string"
        ? e
        : e.type
        ? []
        : `${e.as ? e.as + ": " : ""}${e.name}`
    )
    .join(",\n")}\n}`
);

for (const line of primordials) {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  console.log(line);
}
