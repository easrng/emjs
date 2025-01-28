/* eslint-disable no-restricted-syntax */
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
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression > .callee:not(Identifier):not(:has(Identifier[name=/^safe_|^Safe/], PrivateIdentifier)):not(Super)",
          message: "Only call static functions.",
        },
        {
          selector:
            "SpreadElement:not(ObjectExpression > SpreadElement):not(:has(Identifier[name=/^Safe|safe_/]))",
          message: "Only spread safe iterators.",
        },
      ],
    },
  },
];
