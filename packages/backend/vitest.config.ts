import { defineConfig } from "vitest/config";

// CPU-heavy labelled ablations. They run after the unit group so they do not
// share CPU with ~75 other files and stay far inside their 60 s timeouts.
const HEAVY_EVALS = [
  "tests/memory/eval.test.ts",
  "tests/memory/hard-eval.test.ts",
  "tests/memory/eval-autolink.test.ts",
  "tests/memory/eval-perf.test.ts",
];

export default defineConfig({
  test: {
    disableConsoleIntercept: true,
    projects: [
      {
        extends: true,
        test: {
          name: "convex",
          include: ["convex/**/*.test.ts"],
          environment: "edge-runtime",
        },
      },
      {
        extends: true,
        test: {
          name: "node",
          include: ["tests/**/*.test.ts"],
          exclude: HEAVY_EVALS,
          environment: "node",
        },
      },
      {
        extends: true,
        test: {
          name: "eval",
          include: HEAVY_EVALS,
          environment: "node",
          sequence: { groupOrder: 1 },
        },
      },
    ],
  },
});
