// AI-generated (Claude), prompt: "parse v2 fact extraction and update decision llm responses"
// Modified by me: accepted fenced json and skipped empty fact text
import { describe, expect, it } from "vitest";
import {
  parseFactExtractionResponse,
  parseUpdateDecisionResponse,
} from "../convex/prompts/v2Prompt";

describe("parseFactExtractionResponse", () => {
  it("parses facts from plain JSON", () => {
    const result = parseFactExtractionResponse(
      '{"facts":[{"id":1,"text":"User prefers dark mode"}]}',
    );
    expect(result).toEqual({
      facts: [{ id: 1, text: "User prefers dark mode" }],
    });
  });

  it("parses facts wrapped in a markdown code fence", () => {
    const result = parseFactExtractionResponse(
      '```json\n{"facts":[{"text":"Runs marathons"}]}\n```',
    );
    expect(result).toEqual({ facts: [{ id: 0, text: "Runs marathons" }] });
  });

  it("returns an empty facts list when the model returns no facts", () => {
    const result = parseFactExtractionResponse('{"facts":[]}');
    expect(result).toEqual({ facts: [] });
  });

  it("rejects responses without a facts array", () => {
    expect(parseFactExtractionResponse('{"items":[]}')).toBeNull();
    expect(parseFactExtractionResponse("not json")).toBeNull();
  });

  it("skips fact entries with empty text", () => {
    const result = parseFactExtractionResponse(
      '{"facts":[{"text":"  "},{"text":"Valid fact"}]}',
    );
    expect(result).toEqual({ facts: [{ id: 0, text: "Valid fact" }] });
  });
});

describe("parseUpdateDecisionResponse", () => {
  it("accepts a valid ADD decision", () => {
    expect(
      parseUpdateDecisionResponse('{"event":"ADD","text":"New preference"}'),
    ).toEqual({
      event: "ADD",
      id: undefined,
      text: "New preference",
      oldMemory: undefined,
    });
  });

  it("accepts a valid UPDATE decision", () => {
    expect(
      parseUpdateDecisionResponse(
        '{"event":"update","id":"mem-1","text":"Revised body","old_memory":"Old body"}',
      ),
    ).toEqual({
      event: "UPDATE",
      id: "mem-1",
      text: "Revised body",
      oldMemory: "Old body",
    });
  });

  it("accepts a valid DELETE decision", () => {
    expect(
      parseUpdateDecisionResponse('{"event":"DELETE","id":"mem-9"}'),
    ).toEqual({
      event: "DELETE",
      id: "mem-9",
      text: undefined,
      oldMemory: undefined,
    });
  });

  it("accepts NONE without extra fields", () => {
    expect(parseUpdateDecisionResponse('{"event":"NONE"}')).toEqual({
      event: "NONE",
      id: undefined,
      text: undefined,
      oldMemory: undefined,
    });
  });

  it("rejects ADD without text", () => {
    expect(parseUpdateDecisionResponse('{"event":"ADD"}')).toBeNull();
  });

  it("rejects UPDATE without id or text", () => {
    expect(
      parseUpdateDecisionResponse('{"event":"UPDATE","id":"x"}'),
    ).toBeNull();
    expect(
      parseUpdateDecisionResponse('{"event":"UPDATE","text":"x"}'),
    ).toBeNull();
  });

  it("rejects DELETE without id", () => {
    expect(parseUpdateDecisionResponse('{"event":"DELETE"}')).toBeNull();
  });

  it("rejects unknown event types", () => {
    expect(parseUpdateDecisionResponse('{"event":"MERGE"}')).toBeNull();
  });
});
