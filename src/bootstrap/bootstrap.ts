import {
  undefined,
  Error,
  globalThis,
  JSONStringify,
  ObjectDefineProperties,
  type ArrayBuffer,
} from "./primordials.js";
import { createEncodingClasses } from "./encoding.js";
import { createConsole } from "./console.js";
import { SafeSet } from "./primordial-utils.js";
import { FS, moduleResolve } from "@easrng/import-meta-resolve/lib/resolve.js";
import {
  fileURLToPath,
  pathToFileURL,
} from "@easrng/import-meta-resolve/lib/node-url.js";
import path from "@easrng/import-meta-resolve/lib/node-path.js";

export type Internals = {
  /** Prints to stdout */
  print(str: string): void;
  /** Executes microtasks */
  execute_pending_job(): boolean;
  /** Module loader */
  loader_load(url: string): string;
  /** Module resolver */
  loader_resolve(specifier: string, base: string): string;
  /** UTF8 bytes to string */
  decode_utf8(
    buffer: ArrayBuffer,
    offset: number,
    fatal: boolean,
    ignoreBOM: boolean
  ): string;
  /** UTF8 bytes from string */
  encode_utf8(str: string): ArrayBuffer;
  realpath(str: string): string | undefined;
  readtextfile(str: string): string | undefined;
  getcwd(): string | undefined;
  getmode(str: string): number | undefined;
  argv: string[];
};

export default function bootstrap(internals: Internals) {
  const { execute_pending_job, realpath, getcwd, readtextfile, getmode } =
    internals;
  const console = createConsole(internals);
  internals.loader_load = function loader_load(name) {
    const cwd = getcwd();
    if (!cwd) throw new Error("failed to get cwd");
    const text = readtextfile(
      name.startsWith("emjs:")
        ? path.resolve(cwd, "dist/lib", name.slice(5))
        : fileURLToPath(name)
    );
    if (!text)
      throw new Error("module at " + JSONStringify(name) + " not found");
    return text;
  };
  const conditions = new SafeSet(["import", "emjs"]);
  const fs: FS = {
    readFileSync: function (path: string): string | undefined {
      return readtextfile(path);
    },
    realpathSync: function (path) {
      const newpath = realpath(path);
      if (!newpath) throw new Error("realpath failed");
      return newpath;
    },
    statSync: function (path: string) {
      const mode = getmode(path);
      return mode === undefined
        ? (undefined as never)
        : {
            isDirectory() {
              return !!(mode & 0o0040000);
            },
            isFile() {
              return !!(mode & 0o0100000);
            },
          };
    },
  };
  internals.loader_resolve = function loader_resolve(specifier, base): string {
    const fromInternal = base.startsWith("emjs:internal/");
    let baseURL: InstanceType<typeof URL>;
    if (specifier.startsWith("emjs:")) {
      const url = new URL(specifier);
      if (!fromInternal && url.pathname.startsWith("internal/")) {
        throw new Error("External modules may not import emjs internals.");
      }
      return "emjs:" + url.pathname;
    }
    if (fromInternal || base === "<input>") {
      const cwd = getcwd();
      if (!cwd) throw new Error("failed to get cwd");
      baseURL = pathToFileURL(cwd + "/.dummy");
    } else {
      baseURL = new URL(base);
    }
    const resolved = moduleResolve(specifier, baseURL, fs, conditions).href;
    return resolved;
  };
  const { TextEncoder, TextDecoder } = createEncodingClasses(internals);
  ObjectDefineProperties(globalThis, {
    console: {
      __proto__: null,
      configurable: true,
      enumerable: false,
      writable: true,
      value: console,
    },
    TextEncoder: {
      __proto__: null,
      configurable: true,
      enumerable: false,
      writable: true,
      value: TextEncoder,
    },
    TextDecoder: {
      __proto__: null,
      configurable: true,
      enumerable: false,
      writable: true,
      value: TextDecoder,
    },
  });
  const { URL, URLSearchParams } =
    // @ts-expect-error using require in es module
    // eslint-disable-next-line no-restricted-globals, @typescript-eslint/no-require-imports
    require("whatwg-url") as typeof import("whatwg-url");
  ObjectDefineProperties(globalThis, {
    URL: {
      __proto__: null,
      configurable: true,
      enumerable: false,
      writable: true,
      value: URL,
    },
    URLSearchParams: {
      __proto__: null,
      configurable: true,
      enumerable: false,
      writable: true,
      value: URLSearchParams,
    },
  });

  import(["emjs:internal/init"][0]!).then(
    (o) => {
      console.log("imported", o);
    },
    (e) => {
      console.error(e.message + "\n" + e.stack);
    }
  );
  // run microtasks
  while (execute_pending_job());
}
