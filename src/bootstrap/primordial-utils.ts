import {
  ArrayBufferPrototypeGetByteLength,
  ArrayPrototypeForEach,
  DataViewPrototypeGetByteLength,
  FunctionPrototypeCall,
  ObjectFreeze,
  ObjectSetPrototypeOf,
  ReflectDefineProperty,
  ReflectGetOwnPropertyDescriptor,
  ReflectOwnKeys,
  Map,
  SymbolIterator,
  uncurryThis,
  ArrayPrototypeSymbolIterator,
  SetPrototypeSymbolIterator,
  MapPrototypeSymbolIterator,
  StringPrototypeSymbolIterator,
  WeakMap,
  Set,
  WeakSet,
  RegExp,
  Promise,
  ArrayPrototypeJoin,
  PromisePrototypeThen,
  ObjectPrototypeIsPrototypeOf,
  PromisePrototype,
  undefined,
  Uint8Array,
  type Array,
  type Iterator,
  ReflectGetPrototypeOf,
  ArrayPrototype,
  SymbolToStringTag,
  SharedArrayBufferPrototypeGetByteLength,
} from "./primordials.js";

declare global {
  interface PropertyDescriptor {
    __proto__?: null;
  }
}
interface Constructor {
  new (...args: never[]): object;
  readonly prototype: object;
}

// Because these functions are used by `makeSafe`, which is exposed
// on the `primordials` object, it's important to use const references
// to the primordials that they use:
const createSafeIterator = <F>(
  factory: (_: Iterable<unknown>) => F,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  next: (_: F) => IteratorResult<any, undefined>
): {
  new<T>(iterable: Iterable<T>): IterableIterator<T>
} => {
  class SafeIterator<T> implements IterableIterator<T> {
    #iterator: F;
    constructor(iterable: Iterable<T>) {
      this.#iterator = factory(iterable);
    }
    next() {
      return next(this.#iterator);
    }
    [SymbolIterator]() {
      return this;
    }
  }
  ObjectSetPrototypeOf(SafeIterator.prototype, null);
  ObjectFreeze(SafeIterator.prototype);
  ObjectFreeze(SafeIterator);
  return SafeIterator;
};

export const ArrayIteratorPrototype = ReflectGetPrototypeOf(
  ArrayPrototype[SymbolIterator]()
)! as {
  [SymbolToStringTag]: "Array Iterator";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  next: Iterator<any, any>["next"];
};

// @ts-expect-error i'll type this later
export const TypedArrayPrototype = ReflectGetPrototypeOf(Uint8Array)!.prototype;
export const TypedArrayPrototypeGetSymbolToStringTag = uncurryThis(
  ReflectGetOwnPropertyDescriptor(TypedArrayPrototype, SymbolToStringTag)!.get!
);
export const TypedArrayPrototypeGetBuffer = uncurryThis(
  ReflectGetOwnPropertyDescriptor(TypedArrayPrototype, "buffer")!.get!
);
export const TypedArrayPrototypeGetByteLength = uncurryThis(
  ReflectGetOwnPropertyDescriptor(TypedArrayPrototype, "byteLength")!.get!
);
export const TypedArrayPrototypeGetByteOffset = uncurryThis(
  ReflectGetOwnPropertyDescriptor(TypedArrayPrototype, "byteOffset")!.get!
);
export const TypedArrayPrototypeSubarray = uncurryThis(
  TypedArrayPrototype.subarray
);
export const ArrayPrototypeMap = uncurryThis(ArrayPrototype.map) as <T, U>(
  self: T[],
  callbackfn: (value: T, index: number, array: T[]) => U
) => U[];

const ArrayIteratorPrototypeNext = uncurryThis(ArrayIteratorPrototype.next);

export const SafeArrayIterator = createSafeIterator(
  ArrayPrototypeSymbolIterator,
  ArrayIteratorPrototypeNext
);
export const SafeSetIterator = createSafeIterator(
  SetPrototypeSymbolIterator,
  ArrayIteratorPrototypeNext
);
export const SafeMapIterator = createSafeIterator(
  MapPrototypeSymbolIterator,
  ArrayIteratorPrototypeNext
);
export const SafeStringIterator = createSafeIterator(
  StringPrototypeSymbolIterator,
  ArrayIteratorPrototypeNext
);

const copyProps = (src: object, dest: object) => {
  ArrayPrototypeForEach(ReflectOwnKeys(src), (key) => {
    if (!ReflectGetOwnPropertyDescriptor(dest, key)) {
      ReflectDefineProperty(
        dest,
        key,
        ReflectGetOwnPropertyDescriptor(src, key)!
      );
    }
  });
};

/**
 * @type {typeof primordials.makeSafe}
 */
const makeSafe = <T extends Constructor>(unsafe: Constructor, safe: T): T => {
  if (SymbolIterator in unsafe.prototype) {
    const dummy = new unsafe();
    let next; // We can reuse the same `next` method.

    ArrayPrototypeForEach(ReflectOwnKeys(unsafe.prototype), (key) => {
      if (!ReflectGetOwnPropertyDescriptor(safe.prototype, key)) {
        const desc = ReflectGetOwnPropertyDescriptor(unsafe.prototype, key)!;
        if (
          typeof desc.value === "function" &&
          desc.value.length === 0 &&
          SymbolIterator in (FunctionPrototypeCall(desc.value, dummy) ?? {})
        ) {
          const createIterator = uncurryThis(desc.value);
          next ??= uncurryThis(createIterator(dummy).next);
          const SafeIterator = createSafeIterator(createIterator, next);
          desc.value = function (this: Iterable<unknown>) {
            return new SafeIterator(this);
          };
        }
        ReflectDefineProperty(safe.prototype, key, desc);
      }
    });
  } else {
    copyProps(unsafe.prototype, safe.prototype);
  }
  copyProps(unsafe, safe);

  ObjectSetPrototypeOf(safe.prototype, null);
  ObjectFreeze(safe.prototype);
  ObjectFreeze(safe);
  return safe;
};

// Subclass the constructors because we need to use their prototype
// methods later.
// Defining the `constructor` is necessary here to avoid the default
// constructor which uses the user-mutable `%ArrayIteratorPrototype%.next`.
export const SafeMap = makeSafe(
  Map,
  class SafeMap<K, V> extends Map<K, V> {
    constructor(i?:  [K, V][]) {
      if (i == null) {
        super();
        return;
      }
      super(new SafeArrayIterator(i));
    }
  }
);
export const SafeWeakMap = makeSafe(
  WeakMap,
  class SafeWeakMap extends WeakMap {
    constructor(i?: unknown[]) {
      if (i == null) {
        super();
        return;
      }
      // @ts-expect-error idk why but it's picking the wrong overload
      super(new SafeArrayIterator(i));
    }
  }
);

export const SafeSet = makeSafe(
  Set,
  class SafeSet extends Set {
    constructor(i?: unknown) {
      if (i == null) {
        super();
        return;
      }
      // @ts-expect-error idk why but it's picking the wrong overload
      super(new SafeArrayIterator(i));
    }
  }
);
export const SafeWeakSet = makeSafe(
  WeakSet,
  class SafeWeakSet extends WeakSet {
    constructor(i?: WeakKey[]) {
      if (i == null) {
        super();
        return;
      }
      super(new SafeArrayIterator(i));
    }
  }
);

export const SafeRegExp = makeSafe(
  RegExp,
  class SafeRegExp extends RegExp {
    constructor(pattern: RegExp | string, flags?: string) {
      super(pattern, flags);
    }
  }
);

const SafePromise = makeSafe(
  Promise,
  class SafePromise<T> extends Promise<T> {
    constructor(
      executor: (
        resolve: (value: T | PromiseLike<T>) => void,
        reject: (reason?: unknown) => void
      ) => void
    ) {
      super(executor);
    }
  }
);

export const ArrayPrototypeToString = (thisArray: unknown[]) =>
  ArrayPrototypeJoin(thisArray);

// export const TypedArrayPrototypeToString = (thisArray) =>
//  TypedArrayPrototypeJoin(thisArray);

// The default .catch looks up .then on PromisePrototype
export const PromisePrototypeCatch = (
  thisPromise: PromiseLike<unknown>,
  onRejected:
    | ((reason: unknown) => unknown | PromiseLike<unknown>)
    | null
    | undefined
) => PromisePrototypeThen(thisPromise, undefined, onRejected);

const arrayToSafePromiseIterable = <T>(
  array: Array<T | PromiseLike<T>>
): IterableIterator<T | PromiseLike<T>> =>
  new SafeArrayIterator(
    ArrayPrototypeMap(array, (p) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (ObjectPrototypeIsPrototypeOf(PromisePrototype, p as any)) {
        return new SafePromise((c, d) => PromisePrototypeThen(p, c, d));
      }
      return p;
    })
  );

/**
 * Creates a Promise that is resolved with an array of results when all of the
 * provided Promises resolve, or rejected when any Promise is rejected.
 */
export const SafePromiseAll = <T>(
  values: Array<T | PromiseLike<T>>
): Promise<Awaited<T>[]> =>
  // Wrapping on a new Promise is necessary to not expose the SafePromise
  // prototype to user-land.
  new Promise((a, b) =>
    SafePromise.all<T>(arrayToSafePromiseIterable(values)).then(a, b)
  );

// NOTE: Uncomment the following functions when you need to use them

// /**
//  * Creates a Promise that is resolved with an array of results when all
//  * of the provided Promises resolve or reject.
//  * @template T
//  * @param {Array<T | PromiseLike<T>>} values
//  * @returns {Promise<PromiseSettledResult<T>[]>}
//  */
// primordials.SafePromiseAllSettled = (values) =>
//   // Wrapping on a new Promise is necessary to not expose the SafePromise
//   // prototype to user-land.
//   new Promise((a, b) =>
//     SafePromise.allSettled(arrayToSafePromiseIterable(values)).then(a, b)
//   );

// /**
//  * The any function returns a promise that is fulfilled by the first given
//  * promise to be fulfilled, or rejected with an AggregateError containing
//  * an array of rejection reasons if all of the given promises are rejected.
//  * It resolves all elements of the passed iterable to promises as it runs
//  * this algorithm.
//  * @template T
//  * @param {T} values
//  * @returns {Promise<Awaited<T[number]>>}
//  */
// primordials.SafePromiseAny = (values) =>
//   // Wrapping on a new Promise is necessary to not expose the SafePromise
//   // prototype to user-land.
//   new Promise((a, b) =>
//     SafePromise.any(arrayToSafePromiseIterable(values)).then(a, b)
//   );

// /**
//  * Creates a Promise that is resolved or rejected when any of the provided
//  * Promises are resolved or rejected.
//  * @template T
//  * @param {T} values
//  * @returns {Promise<Awaited<T[number]>>}
//  */
// primordials.SafePromiseRace = (values) =>
//   // Wrapping on a new Promise is necessary to not expose the SafePromise
//   // prototype to user-land.
//   new Promise((a, b) =>
//     SafePromise.race(arrayToSafePromiseIterable(values)).then(a, b)
//   );

/**
 * Attaches a callback that is invoked when the Promise is settled (fulfilled or
 * rejected). The resolved value cannot be modified from the callback.
 * Prefer using async functions when possible.
 */
export const SafePromisePrototypeFinally = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  thisPromise: Promise<any>,
  onFinally: (() => void) | undefined | null
) =>
  // Wrapping on a new Promise is necessary to not expose the SafePromise
  // prototype to user-land.
  new Promise((a, b) =>
    new SafePromise((a, b) => PromisePrototypeThen(thisPromise, a, b))
      .finally(onFinally)
      .then(a, b)
  );

export function isNonSharedArrayBuffer(value: unknown) {
  try {
    // This will throw on SharedArrayBuffers, but not detached ArrayBuffers.
    // (The spec says it should throw, but the spec conflicts with implementations: https://github.com/tc39/ecma262/issues/678)
    ArrayBufferPrototypeGetByteLength(value);
    return true;
  } catch {
    return false;
  }
}
export function isSharedArrayBuffer(value: unknown) {
  try {
    SharedArrayBufferPrototypeGetByteLength(value);
    return true;
  } catch {
    return false;
  }
}
export function isTypedArray(value: unknown) {
  try {
    TypedArrayPrototypeGetBuffer(value);
    return true;
  } catch {
    return false;
  }
}
export function isArrayBufferDetached(value: unknown) {
  try {
    // @ts-expect-error using as validator, throwing is expected
    new Uint8Array(value);
    return false;
  } catch {
    return true;
  }
}
export function isDataView(value: unknown) {
  try {
    DataViewPrototypeGetByteLength(value);
    return true;
  } catch {
    return false;
  }
}
