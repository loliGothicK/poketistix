import { defineConfig } from "oxfmt";

export default defineConfig({
  ignorePatterns: [],
  printWidth: 100,
  overrides: [
    {
      files: ["*.test.ts", "*.spec.ts"],
      options: {
        printWidth: 120,
      },
    },
  ],
});
