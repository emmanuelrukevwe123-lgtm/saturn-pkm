import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  { ignores: ["node_modules/**", "dist/**", "test-results/**", "playwright-report/**", "design/**"] },
  js.configs.recommended,
  {
    files: ["src/**/*.{js,jsx}"],
    plugins: { react, "react-hooks": reactHooks },
    languageOptions: { globals: { ...globals.browser }, parserOptions: { ecmaFeatures: { jsx: true } } },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "react/jsx-uses-vars": "error",
      "react/no-danger-with-children": "error",
      "react/jsx-no-target-blank": "error",
      "react/jsx-no-script-url": "error",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  {
    files: ["api/**/*.js", "tests/**/*.js", "*.config.js"],
    languageOptions: { globals: { ...globals.node } },
    rules: { "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }] },
  },
  {
    // Code here runs inside the browser, through Playwright or jsdom.
    files: ["tests/e2e/**/*.js", "tests/unit/editor.test.js"],
    languageOptions: { globals: { ...globals.browser } },
  },
];
