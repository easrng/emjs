import _objectInspect from "object-inspect";
import { SafeArrayIterator, SafeMap } from "./primordial-utils.js";
import {
  ArrayPrototypeIncludes,
  NumberParseInt,
  NumberParseFloat,
  StringPrototypeSlice,
  MapPrototypeHas,
  MapPrototypeGet,
  MapPrototypeSet,
  RegExpPrototypeSymbolReplace,
  ReflectGetOwnPropertyDescriptor,
  Error,
  SymbolToStringTag,
  String,
} from "./primordials.js";
import { Internals } from "./bootstrap.js";

function saferObjectInspect(o: unknown) {
  try {
    return _objectInspect(o);
  } catch {
    return `${o}`;
  }
}

type Console = {
  log: (...a: unknown[]) => void;
  assert: (condition?: unknown, ...args: unknown[]) => void;
  clear: () => void;
  count: (label?: unknown) => void;
  countReset: (label?: unknown) => void;
  debug: (...a: unknown[]) => void;
  error: (...a: unknown[]) => void;
  info: (...a: unknown[]) => void;
  table: (...a: unknown[]) => void;
  trace: (...args: unknown[]) => void;
  warn: (...a: unknown[]) => void;
  dir: (...a: unknown[]) => void;
  dirxml: (...a: unknown[]) => void;
  group: () => void;
  groupCollapsed: () => void;
  groupEnd: () => void;
  time: () => void;
  timeLog: () => void;
  timeEnd: () => void;
  exception: (...a: unknown[]) => void;
  timeStamp: () => void;
  profile: () => void;
  profileEnd: () => void;
  [SymbolToStringTag]: "console";
};
function inspectArgs(args: unknown[]) {
  const first = args[0];
  let a = 0;
  let string = "";

  if (typeof first == "string" && args.length > 1) {
    a++;
    // Index of the first not-yet-appended character. Use this so we only
    // have to append to `string` when a substitution occurs / at the end.
    let appendedChars = 0;
    for (let i = 0; i < first.length - 1; i++) {
      if (first[i] == "%") {
        const char = first[++i];
        if (a < args.length) {
          let formattedArg = null;
          if (char == "s") {
            // Format as a string.
            formattedArg = String(args[a++]);
          } else if (ArrayPrototypeIncludes(["d", "i"], char)) {
            // Format as an integer.
            const value = args[a++];
            if (typeof value === "symbol") {
              formattedArg = "NaN";
            } else {
              formattedArg = `${NumberParseInt(value as string)}`;
            }
          } else if (char == "f") {
            // Format as a floating point value.
            const value = args[a++];
            if (typeof value === "symbol") {
              formattedArg = "NaN";
            } else {
              formattedArg = `${NumberParseFloat(value as string)}`;
            }
          } else if (ArrayPrototypeIncludes(["O", "o"], char)) {
            // Format as an object.
            formattedArg = saferObjectInspect(args[a++]);
          } else if (char == "c") {
            formattedArg = "";
          }

          if (formattedArg != null) {
            string +=
              StringPrototypeSlice(first, appendedChars, i - 1) + formattedArg;
            appendedChars = i + 1;
          }
        }
        if (char == "%") {
          string += StringPrototypeSlice(first, appendedChars, i - 1) + "%";
          appendedChars = i + 1;
        }
      }
    }
    string += StringPrototypeSlice(first, appendedChars);
  }

  for (; a < args.length; a++) {
    if (a > 0) {
      string += " ";
    }
    if (typeof args[a] == "string") {
      string += args[a];
    } else {
      // Use default maximum depth for null or undefined arguments.
      string += saferObjectInspect(args[a]);
    }
  }

  return string;
}
export function createConsole({ print }: Internals) {
  const log =
    () =>
    (...a: unknown[]) => {
      print(inspectArgs(a));
    };
  const noop = () => () => {};
  const countMap = new SafeMap();
  const console = {
    log: log(),
    assert: (condition: unknown = false, ...args: unknown[]) => {
      if (condition) {
        return;
      }

      if (args.length === 0) {
        console.error("Assertion failed");
        return;
      }

      const [first, ...rest] = new SafeArrayIterator(args);

      if (typeof first === "string") {
        console.error(
          `Assertion failed: ${first}`,
          ...new SafeArrayIterator(rest)
        );
        return;
      }

      console.error(`Assertion failed:`, ...new SafeArrayIterator(args));
    },
    clear: noop(),
    count: (label = "default") => {
      label = String(label);

      if (MapPrototypeHas(countMap, label)) {
        const current = MapPrototypeGet(countMap, label) || 0;
        MapPrototypeSet(countMap, label, current + 1);
      } else {
        MapPrototypeSet(countMap, label, 1);
      }

      console.info(`${label}: ${MapPrototypeGet(countMap, label)}`);
    },
    countReset: (label = "default") => {
      label = String(label);

      if (MapPrototypeHas(countMap, label)) {
        MapPrototypeSet(countMap, label, 0);
      } else {
        console.warn(`Count for '${label}' does not exist`);
      }
    },
    debug: log(),
    error: log(),
    info: log(),
    table: log(), // todo: table
    trace: (...args: unknown[]) => {
      const message = inspectArgs(args);
      console.error(
        `Trace: %s\n%s`,
        message,
        RegExpPrototypeSymbolReplace(
          /^.+\n/,
          ReflectGetOwnPropertyDescriptor(new Error(), "stack")!.value!,
          ""
        )
      );
    },
    warn: log(),
    dir: log(),
    dirxml: log(),
    group: noop(),
    groupCollapsed: noop(),
    groupEnd: noop(),
    time: noop(), // todo: time
    timeLog: noop(), // todo: time
    timeEnd: noop(), // todo: time
    exception: log(),
    timeStamp: noop(),
    profile: noop(),
    profileEnd: noop(),
    [SymbolToStringTag]: "console",
  } satisfies Console;
  return console;
}
