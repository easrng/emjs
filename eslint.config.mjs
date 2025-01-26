/* eslint-disable no-restricted-globals */
/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import pluginJs from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

const blockedGlobals = new Set(Object.values(globals).flatMap(Object.keys));
blockedGlobals.delete("undefined");
/** @type {import('eslint').Linter.Config[]} */
export default [
  { ignores: ["quickjs/", "build/"] },
  { files: ["**/*.{js,mjs,cjs,ts}"] },
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "no-restricted-globals": ["error", ...blockedGlobals],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
];
