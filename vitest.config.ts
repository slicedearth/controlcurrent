import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["src/**/*.ts"],
      exclude: ["src/catalogue.ts"],
      thresholds: {
        lines: 90,
        functions: 90,
        statements: 88,
        branches: 75
      }
    }
  }
});
