import js from "@eslint/js";
import globals from "globals";

export default [
  { ignores: ["node_modules/**", "test-results/**", "playwright-report/**", "design/**"] },
  js.configs.recommended,
  {
    files: ["public/**/*.js"],
    languageOptions: { globals: { ...globals.browser } },
    rules: { "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^(updateSelected|normalizeTitle)$" }] },
  },
  {
    files: ["api/**/*.js", "tests/**/*.js", "*.config.js"],
    languageOptions: { globals: { ...globals.node } },
    rules: { "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }] },
  },
];
