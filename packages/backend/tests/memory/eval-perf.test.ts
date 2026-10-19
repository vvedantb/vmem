import { describe, expect, it } from "vitest";
import { generateBenchmarkCorpus } from "../../eval/corpus";
import { generateHardCorpus } from "../../eval/hard-corpus";
import { runPooledComparison } from "../../eval/benchmark";
import { useDeterministicEval } from "./evalHarness";

// Wall-clock budget: opt-in, because shared CPU makes it flaky in `pnpm test`.
// The default suites check the deterministic stand-in (rank pool size).
const P95_BUDGET_MS = 100;

describe.runIf(process.env.EVAL_PERF === "1")("index pool latency", () => {
  useDeterministicEval();

  for (const { label, make } of [
    { label: "labelled", make: generateBenchmarkCorpus },
    { label: "hard", make: generateHardCorpus },
  ]) {
    it(`ranks ${label} queries under the p95 budget`, async () => {
      const { widened, report } = await runPooledComparison(make(), label);
      if (process.env.EVAL_VERBOSE) {
        console.log(`\n${report}\n`);
      }
      expect(widened.latencyP95).toBeLessThan(P95_BUDGET_MS);
    }, 60_000);
  }
});
