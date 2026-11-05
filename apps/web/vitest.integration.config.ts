import { defineConfig, mergeConfig } from "vitest/config";
import baseConfig from "./vitest.config";

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      include: ["src/**/*.integration.test.ts"],
      exclude: [],
      testTimeout: 300_000,
      hookTimeout: 60_000,
    },
  }),
);
