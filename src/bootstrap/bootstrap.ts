import {
  Error,
  FunctionPrototypeBind,
  FunctionPrototypeCall,
  JSONStringify,
  RegExpPrototypeTest,
  StringPrototypeStartsWith,
  type ArrayBuffer,
} from "./primordials.js";
import primordials from "./primordials.js";
import primordialUtils, { PromisePrototypeCatch } from "./primordial-utils.js";
import { SafeSet } from "./primordial-utils.js";
import { FS, moduleResolve } from "@easrng/import-meta-resolve/lib/resolve.js";
import {
  fileURLToPath,
  pathToFileURL,
} from "@easrng/import-meta-resolve/lib/node-url.js";
export type Internals = {
  /** Writes string to fd as utf-8 */
  write_str(fd: number, str: string): void;
  /** Executes microtasks */
  execute_pending_job(): boolean;
  /** Module loader */
  loader_load(url: string): string;
  /** Module resolver */
  loader_resolve(specifier: string, base: string): string;
  /** Set up import.meta */
  loader_init(url: string, importMeta: ImportMeta): void;
  /** UTF8 bytes to string */
  decode_utf8(
    buffer: ArrayBuffer,
    offset: number,
    length: number,
    fatal: boolean
  ): string;
  /** UTF8 bytes from string */
  encode_utf8(str: string): ArrayBuffer;
  realpath(str: string): string | undefined;
  readtextfile(str: string): string | undefined;
  getcwd(): string | undefined;
  getmode(str: string): number | undefined;
  argv: string[];
  URL: typeof import("../lib/internal/url.js").URL | undefined;
};

export default function bootstrap(internals: Internals) {
  const {
    execute_pending_job,
    realpath,
    getcwd,
    readtextfile,
    getmode,
    write_str,
  } = internals;

  function importMetaResolve(
    this: InstanceType<NonNullable<typeof internals.URL>> | undefined,
    specifier: string
  ) {
    try {
      return moduleResolve(specifier, this, fs, conditions).href;
    } catch (e) {
      if (e instanceof Error && "code" in e) throw e;
      throw new Error(
        `Failed to resolve module specifier ${JSONStringify(specifier)}${
          this ? ` from ${JSONStringify(this.href)}` : ""
        }`
      );
    }
  }

  internals.loader_load = function loader_load(name) {
    const cwd = getcwd();
    if (!cwd) throw new Error("failed to get cwd");
    const text = readtextfile(fileURLToPath(name));
    if (!text)
      throw new Error("module at " + JSONStringify(name) + " not found");
    return text;
  };
  internals.loader_init = function loader_init(url, importMeta) {
    importMeta.url = url;
    if (!StringPrototypeStartsWith(url, "emjs:")) {
      if (!internals.URL) {
        throw new Error(
          "may not import external modules until after setting up URL"
        );
      }
      importMeta.resolve = FunctionPrototypeBind(
        importMetaResolve,
        new internals.URL(url)
      );
    }
    if (url === "emjs:internal/internals") {
      const injectInternals = importMeta as unknown as Record<string, unknown>;
      injectInternals["internals"] = internals;
      injectInternals["primordials"] = primordials;
      injectInternals["primordialUtils"] = primordialUtils;
    }
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
    const fromInternal = StringPrototypeStartsWith(base, "emjs:");
    if (!internals.URL) {
      if (!fromInternal) {
        throw new Error("this should never happen");
      }
      if (RegExpPrototypeTest(/^emjs:[/a-z0-9_-]+$/, specifier)) {
        return specifier === "emjs:internal/url/tr46-mapping-table"
          ? "json:" + specifier
          : specifier;
      }
      throw new Error(
        `failed to resolve ${JSONStringify(
          specifier
        )}, only canonical emjs specifiers may be imported during bootstrap`
      );
    }
    let baseURL: InstanceType<NonNullable<typeof internals.URL>> | undefined;
    if (StringPrototypeStartsWith(specifier, "emjs:")) {
      const url = new internals.URL(specifier);
      if (
        !fromInternal &&
        StringPrototypeStartsWith(url.pathname, "internal/")
      ) {
        throw new Error("External modules may not import emjs internals.");
      }
      return "emjs:" + url.pathname;
    }
    if (base === "<input>" || fromInternal) {
      const cwd = getcwd();
      if (!cwd) throw new Error("failed to get cwd");
      baseURL = pathToFileURL(cwd + "/.emjs-eval");
    } else {
      baseURL = new internals.URL!(base);
    }
    return FunctionPrototypeCall(importMetaResolve, baseURL, specifier);
  };
  PromisePrototypeCatch(import(["emjs:internal/init"][0]!), (e) => {
    write_str(
      2,
      e instanceof Error ? e.message + "\n" + e.stack + "\n" : e + "\n"
    );
  });
  // run microtasks
  while (execute_pending_job());
}
