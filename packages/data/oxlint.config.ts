import { defineConfig } from "oxlint";

export default defineConfig({
  plugins: ["typescript", "oxc", "unicorn"],
  ignorePatterns: [],
  options: {
    denyWarnings: true,
    typeAware: true,
  },
  rules: {
    "typescript/no-deprecated": "error",
    "typescript/no-explicit-any": "error",
  },
});
