import { internals, primordials } from "emjs:internal/internals";
const { Error } = primordials;
const { getcwd } = internals;
export const argv = internals.argv;
export function cwd() {
  const dir = getcwd();
  if (!dir) throw new Error("failed to get cwd");
  return dir;
}
