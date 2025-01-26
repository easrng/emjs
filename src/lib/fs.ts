import { internals, primordials } from "emjs:internal/internals";
const { TypeError } = primordials;
export const readTextFileSync = (path: string) => {
  if (typeof path !== "string")
    throw new TypeError('argument "path" must be string');
  return internals.readtextfile(path);
};
