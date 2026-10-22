import { ARTIFACT_FORMATS, ARTIFACT_TYPES } from "@vvedantb/server";
import { describe, expect, it } from "vitest";
import { ARTIFACT_REF_KINDS } from "./artifacts/store";
import {
  artifactFormatValidator,
  artifactRefKindValidator,
  artifactTypeValidator,
} from "./validators";

// validators.ts is schema-reachable, so it keeps local copies of the
// @vvedantb/server enums; these checks stop the copies drifting
describe("artifact validators", () => {
  it("type literals match ARTIFACT_TYPES", () => {
    expect(artifactTypeValidator.members.map((m) => m.value)).toEqual([
      ...ARTIFACT_TYPES,
    ]);
  });

  it("format literals match ARTIFACT_FORMATS", () => {
    expect(artifactFormatValidator.members.map((m) => m.value)).toEqual([
      ...ARTIFACT_FORMATS,
    ]);
  });

  it("ref kind literals match ARTIFACT_REF_KINDS (mcp tool params)", () => {
    expect(artifactRefKindValidator.members.map((m) => m.value)).toEqual([
      ...ARTIFACT_REF_KINDS,
    ]);
  });
});
