/* eslint-disable no-var */
/* eslint-disable no-restricted-globals */

declare interface ImportMeta {
  url: string;
  resolve(specifier: string): string;
}
declare interface Console {
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
  [Symbol.toStringTag]: "console";
}
declare var console: Console;

declare type URL = import("./lib/internal/url.ts").URL;
declare var URL: typeof import("./lib/internal/url.ts").URL;

declare type URLSearchParams = import("./lib/internal/url.ts").URLSearchParams;
declare var URLSearchParams: typeof import("./lib/internal/url.ts").URLSearchParams;