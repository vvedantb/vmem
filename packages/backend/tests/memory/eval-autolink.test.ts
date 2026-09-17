import { describe, expect, it } from "vitest";
import { aggregate, runAutoLinkAblation } from "../../eval/benchmark";

describe("auto-extracted links (no planted relationships)", () => {
  it("recovers multi-hop and project-fact graph gains", async () => {
    const { runs, autoLinkCount } = await runAutoLinkAblation();
    expect(autoLinkCount).toBeGreaterThan(30);

    const byType = (name: string, type: string) =>
      aggregate(
        runs
          .find((run) => run.name === name)
          ?.outcomes.filter((row) => row.type === type) ?? [],
      );
    const fullMulti = byType("full hybrid", "multi-hop");
    const noGraphMulti = byType("hybrid (no graph)", "multi-hop");
    expect(fullMulti.ndcg10).toBeGreaterThan(noGraphMulti.ndcg10);
    expect(fullMulti.recall5).toBeGreaterThan(noGraphMulti.recall5);

    const fullProject = byType("full hybrid", "project");
    const noGraphProject = byType("hybrid (no graph)", "project");
    expect(fullProject.ndcg10).toBeGreaterThan(noGraphProject.ndcg10);
    expect(fullProject.recall5).toBeGreaterThan(noGraphProject.recall5);
  }, 60_000);
});
