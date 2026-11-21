import { defineConfig, configDefaults } from "vitest/config";
import baseConfig from "./vitest.config";

export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    include: ["src/**/*.integration.test.ts"],
    exclude: [...configDefaults.exclude],
    testTimeout: 450_000,
    hookTimeout: 60_000,
  },
});
