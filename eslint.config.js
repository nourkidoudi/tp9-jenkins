import js from "@eslint/js";
import globals from "globals";

export default [
  { ignores: ["node_modules", "reports", "coverage"] },
  js.configs.recommended,
  { languageOptions: { globals: globals.node } },
  {
    rules: {
      "no-unused-vars": ["error", { ignoreRestSiblings: true }],
    },
  },
];
