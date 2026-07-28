import { describe, expect, it } from "vitest";
import {
  buildPortraitUpdatePrompt,
  parsePortraitResponse,
  type PortraitEvidenceMemory,
} from "../engine/neo4j/portraitPrompt";

const EVIDENCE: PortraitEvidenceMemory[] = [
  {
    id: "ev-1",
    title: "Works on vmem",
    content: "Building a memory layer for AI agents.",
    type: "knowledge",
    status: "pinned",
    createdAt: "2026-06-01T00:00:00.000Z",
  },
  {
    id: "ev-2",
    title: "Prefers TypeScript",
    content: "Strict TS, no any.",
    type: "profile",
    status: "active",
    createdAt: "2026-06-10T00:00:00.000Z",
  },
];
const EVIDENCE_IDS = EVIDENCE.map((m) => m.id);

describe("parsePortraitResponse", () => {
  it("parses a grounded portrait", () => {
    const parsed = parsePortraitResponse(
      JSON.stringify({
        portrait: "The user builds vmem and prefers strict TypeScript.",
        sourceMemoryIds: ["ev-1", "ev-2"],
      }),
      EVIDENCE_IDS,
    );
    expect(parsed).toEqual({
      portrait: "The user builds vmem and prefers strict TypeScript.",
      sourceMemoryIds: ["ev-1", "ev-2"],
    });
  });

  it("drops invented source ids and rejects fully ungrounded portraits", () => {
    const parsed = parsePortraitResponse(
      JSON.stringify({
        portrait: "Something",
        sourceMemoryIds: ["ev-1", "made-up"],
      }),
      EVIDENCE_IDS,
    );
    expect(parsed?.sourceMemoryIds).toEqual(["ev-1"]);

    const ungrounded = parsePortraitResponse(
      JSON.stringify({ portrait: "Something", sourceMemoryIds: ["made-up"] }),
      EVIDENCE_IDS,
    );
    expect(ungrounded).toBeNull();
  });

  it("rejects empty portraits and malformed JSON", () => {
    expect(
      parsePortraitResponse(
        JSON.stringify({ portrait: "  ", sourceMemoryIds: ["ev-1"] }),
        EVIDENCE_IDS,
      ),
    ).toBeNull();
    expect(parsePortraitResponse("not json at all", EVIDENCE_IDS)).toBeNull();
  });
});

describe("buildPortraitUpdatePrompt", () => {
  it("includes the current portrait for incremental revision", () => {
    const prompt = buildPortraitUpdatePrompt("Existing portrait.", EVIDENCE);
    expect(prompt).toContain("Existing portrait.");
    expect(prompt).toContain("id=ev-1");
    expect(prompt).toContain("[pinned]");
  });

  it("signals a first-time portrait when none exists", () => {
    const prompt = buildPortraitUpdatePrompt(null, EVIDENCE);
    expect(prompt).toContain("write the first portrait");
  });
});
