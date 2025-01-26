/* eslint-disable */
// @ts-nocheck
import { fromFileUrl } from "@std/path/posix";
delete globalThis.location;
const process = await import("emjs:process").catch(() =>
  import("node:process")
);
const testurl = import.meta.resolve(process.argv[2]);
const readTextFileSync = await import("emjs:fs")
  .then((e) => e.readTextFileSync)
  .catch(() => import("node:fs").then((m) => (p) => m.readFileSync(p, "utf8")));
globalThis.fetch = function fetch(url) {
  const u = fromFileUrl(
    url[0] === "/"
      ? import.meta.resolve("./node_modules/wpt" + url)
      : new URL(url, testurl).href
  );
  const text = readTextFileSync(u);
  if (!text)
    return Promise.reject(new Error("failed to fetch " + u + " " + url));
  return Promise.resolve({
    ok: true,
    text: () => Promise.resolve(text),
    json: () => Promise.resolve(JSON.parse(text)),
  });
};
globalThis.fetch_spec = function fetch_spec(spec) {
  var url = "/interfaces/" + spec + ".idl";
  return fetch(url)
    .then(function (r) {
      if (!r.ok) {
        throw new IdlHarnessError("Error fetching " + url + ".");
      }
      return r.text();
    })
    .then((idl) => ({ spec, idl }));
};
globalThis.self = globalThis;
globalThis.GLOBAL = {
  isWindow() {
    return false;
  },
  isShadowRealm() {
    return false;
  },
};
globalThis.createBuffer = (() => {
  // See https://github.com/whatwg/html/issues/5380 for why not `new SharedArrayBuffer()`
  let sabConstructor;
  sabConstructor = null;
  return (type, length, opts) => {
    if (type === "ArrayBuffer") {
      return new ArrayBuffer(length, opts);
    } else if (type === "SharedArrayBuffer") {
      if (sabConstructor && sabConstructor.name !== "SharedArrayBuffer") {
        throw new Error("WebAssembly.Memory does not support shared:true");
      }
      return new sabConstructor(length, opts);
    } else {
      throw new Error("type has to be ArrayBuffer or SharedArrayBuffer");
    }
  };
})();

(0, eval)(await (await fetch("/resources/testharness.js")).text());
(0, eval)(await (await fetch("/resources/webidl2/lib/webidl2.js")).text());
(0, eval)(await (await fetch("/resources/idlharness.js")).text());
globalThis.subsetTest = function (testFunc, ...args) {
  return testFunc(...args);
};

(0, eval)(
  (await (await fetch("/encoding/resources/encodings.js")).text()) +
    "\nglobalThis.encodings_table=encodings_table"
);
(0, eval)(
  await (await fetch("/encoding/resources/decoding-helpers.js")).text()
);
add_result_callback(({ message, name, stack, status }) => {
  console.log(
    JSON.stringify(
      { test: testurl, result: { name, status, message, stack } },
      (k, v) => (typeof v === "string" ? JSON.stringify(v) : v)
    )
  );
});

add_completion_callback((_tests, harnessStatus) => {
  console.log(
    JSON.stringify({ test: testurl, harnessStatus }, (k, v) =>
      typeof v === "string" ? JSON.stringify(v) : v
    )
  );
});

(0, eval)(await (await fetch(testurl)).text());
