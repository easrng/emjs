import { internals, primordials } from "emjs:internal/internals";
import { safe_console } from "emjs:internal/console";
import { TextEncoder, TextDecoder } from "emjs:internal/encoding";
import { URL, URLSearchParams } from "emjs:internal/url";
import { argv } from "emjs:process";

const { ObjectDefineProperties, globalThis } = primordials;

internals.URL = URL;
ObjectDefineProperties(globalThis, {
  console: {
    __proto__: null,
    configurable: true,
    enumerable: false,
    writable: true,
    value: { ...safe_console },
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
  self: {
    __proto__: null,
    configurable: true,
    enumerable: false,
    writable: true,
    value: globalThis,
  },
});

if (argv.length < 2) {
  safe_console.error("usage: emjs <import_specifier>");
} else {
  await import(argv[1]!);
}
