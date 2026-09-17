import { describe, expect, it } from "vitest";
import {
  parseFactDecisionResponse,
  resolveFactDecision,
} from "../../engine/memory/factDecision";

const python = {
  id: "mem_py",
  title: "I prefer Python",
  content: "I prefer Python",
};

describe("parseFactDecisionResponse", () => {
  it("reads UPDATE with a known target id", () => {
    const parsed = parseFactDecisionResponse(
      '{"event":"UPDATE","id":"mem_py","text":"I prefer TypeScript"}',
      "I prefer TypeScript",
      [python],
    );
    expect(parsed).toEqual({
      event: "UPDATE",
      targetId: "mem_py",
      text: "I prefer TypeScript",
      oldMemory: "I prefer Python",
    });
  });

  it("rejects UPDATE against an unknown id", () => {
    expect(
      parseFactDecisionResponse(
        '{"event":"UPDATE","id":"missing","text":"I prefer TypeScript"}',
        "I prefer TypeScript",
        [python],
      ),
    ).toBeNull();
  });
});

describe("resolveFactDecision", () => {
  it("forces NONE when the fact already exists even if the LLM says ADD", () => {
    const decision = resolveFactDecision({
      factText: "I prefer Python",
      candidates: [python],
      llmDecision: { event: "ADD", text: "I prefer Python" },
    });
    expect(decision.event).toBe("NONE");
    expect(decision.targetId).toBe("mem_py");
  });

  it("falls back to deterministic ADD when the LLM is missing", () => {
    const decision = resolveFactDecision({
      factText: "I live in London",
      candidates: [python],
    });
    expect(decision.event).toBe("ADD");
  });
});
