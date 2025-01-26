import { internals, primordials } from "emjs:internal/internals";
const { Error } = primordials;
export const argv = internals.argv;
export function cwd() {
  const dir = internals.getcwd();
  if (!dir) throw new Error("failed to get cwd");
  return dir;
}
