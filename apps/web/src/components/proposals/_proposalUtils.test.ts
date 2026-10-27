import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  mergeSelection,
  synthesisSourceListLabel,
  toggleUnticked,
} from "./_proposalUtils";

const here = path.dirname(fileURLToPath(import.meta.url));

const proposal = {
  memoryId: "mem_keep",
  sourceMemoryIds: ["mem_keep", "mem_b", "mem_c"],
};

describe("merge proposal selection", () => {
  it("selects every source by default", () => {
    expect(mergeSelection(proposal, [])).toEqual({
      selectedIds: ["mem_keep", "mem_b", "mem_c"],
      mergedCount: 2,
      partial: false,
    });
  });

  it("leaves unticked sources out, in proposal order", () => {
    expect(mergeSelection(proposal, ["mem_b"])).toEqual({
      selectedIds: ["mem_keep", "mem_c"],
      mergedCount: 1,
      partial: true,
    });
  });

  it("never unticks the kept memory and needs one merged source", () => {
    const selection = mergeSelection(proposal, ["mem_keep", "mem_b", "mem_c"]);
    expect(selection.selectedIds).toEqual(["mem_keep"]);
    expect(selection.mergedCount).toBe(0);
  });

  it("toggles a source in and out", () => {
    const unticked = toggleUnticked([], "mem_b");
    expect(unticked).toEqual(["mem_b"]);
    expect(toggleUnticked(unticked, "mem_b")).toEqual([]);
  });

  it("labels the source list of a merge", () => {
    expect(synthesisSourceListLabel("merge", 3)).toBe("Merges 3 memories");
  });

  it("uses the shared Checkbox and passes the ticked sources on approve", () => {
    const card = readFileSync(
      path.join(here, "SynthesisProposalCard.tsx"),
      "utf8",
    );
    expect(card).toContain("Checkbox");
    expect(card).toMatch(
      /import \{[^}]*\bCheckbox\b[^}]*\} from "@vvedantb\/ui"/,
    );
    expect(card).toContain("onApprove(isMerge ? selection.selectedIds");
    expect(card).toContain("selection.mergedCount === 0");
    expect(card).not.toMatch(/Jev|Qwen|Claude/);
  });
});
