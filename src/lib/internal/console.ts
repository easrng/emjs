import {
  internals,
  primordials,
  primordialUtils,
} from "emjs:internal/internals";
import { inspect } from "emjs:inspect";

const { SafeArrayIterator, SafeMap } = primordialUtils;
const {
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
  String,
  ObjectFreeze,
  ObjectSetPrototypeOf,
} = primordials;
const { write_str } = internals;

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
            formattedArg = inspect(args[a++]);
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
      string += inspect(args[a], {
        indent: 2,
      });
    }
  }

  return string;
}
const log =
  () =>
  (...a: unknown[]) => {
    write_str(1, inspectArgs(a) + "\n");
  };
const logErr =
  () =>
  (...a: unknown[]) => {
    write_str(2, inspectArgs(a) + "\n");
  };
const noop = () => () => {};
const countMap = new SafeMap();
const safe_console: Console = ObjectFreeze(
  ObjectSetPrototypeOf(
    {
      log: log(),
      assert: (condition: unknown = false, ...args: unknown[]) => {
        if (condition) {
          return;
        }

        if (args.length === 0) {
          safe_console.error("Assertion failed");
          return;
        }

        const [first, ...rest] = new SafeArrayIterator(args);

        if (typeof first === "string") {
          safe_console.error(
            `Assertion failed: ${first}`,
            ...new SafeArrayIterator(rest)
          );
          return;
        }

        safe_console.error(`Assertion failed:`, ...new SafeArrayIterator(args));
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

        safe_console.info(`${label}: ${MapPrototypeGet(countMap, label)}`);
      },
      countReset: (label = "default") => {
        label = String(label);

        if (MapPrototypeHas(countMap, label)) {
          MapPrototypeSet(countMap, label, 0);
        } else {
          safe_console.warn(`Count for '${label}' does not exist`);
        }
      },
      debug: log(),
      error: logErr(),
      info: log(),
      table: log(), // todo: table
      trace: (...args: unknown[]) => {
        const message = inspectArgs(args);
        safe_console.error(
          `Trace: %s\n%s`,
          message,
          RegExpPrototypeSymbolReplace(
            /^.+\n/,
            ReflectGetOwnPropertyDescriptor(new Error(), "stack")!.value!,
            ""
          )
        );
      },
      warn: logErr(),
      dir: log(),
      dirxml: log(),
      group: noop(),
      groupCollapsed: noop(),
      groupEnd: noop(),
      time: noop(), // todo: time
      timeLog: noop(), // todo: time
      timeEnd: noop(), // todo: time
      exception: logErr(),
      timeStamp: noop(),
      profile: noop(),
      profileEnd: noop(),
      [primordials.SymbolToStringTag]: "console",
    },
    null
  )
);

export { safe_console };
