import type { Internals } from "../../bootstrap/bootstrap.js";

const injected = import.meta as unknown as {
  internals: Internals;
  primordials: typeof import("../../bootstrap/primordials.js");
  primordialUtils: typeof import("../../bootstrap/primordial-utils.js");
};

// @ts-expect-error duplicate identifier
// eslint-disable-next-line @typescript-eslint/no-namespace
declare namespace primordials {
  // @ts-expect-error this syntax errors but it works
  export * from "../../bootstrap/primordials.js";
}
// @ts-expect-error duplicate identifier
const primordials = injected.primordials;
const internals = injected.internals;
const primordialUtils = injected.primordialUtils;
export { internals, type Internals, primordials, primordialUtils };
