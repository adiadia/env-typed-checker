import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],

    coverage: {
      provider: "v8",
      reportsDirectory: "coverage",
      reporter: ["text", "html", "lcov"],

      // count all src files (not only the ones imported by tests)
      include: ["src/**/*.ts"],
      exclude: ["src/types.ts", "src/**/*.d.ts", "src/index.ts", "src/core/index.ts", "src/cli/index.ts"],

      // ✅ enforce 100% coverage
      thresholds: {
        100: true,
        // (equivalent to lines=100, functions=100, branches=100, statements=100)
      },
    },
  },
});
