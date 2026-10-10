import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: [
        "src/**/*.ts",
        "tools/publication-gate.ts",
        "tools/private-output.ts",
        "tools/collector-network.ts",
        "tools/toolchain-activation.ts"
      ],
      // DOM controllers were previously inline Astro scripts. Their real-browser
      // coverage remains separate from this Node-only unit denominator.
      exclude: ["src/catalogue.ts", "src/controllers/**"],
      thresholds: {
        lines: 90,
        functions: 90,
        statements: 88,
        branches: 75
      }
    }
  }
});
