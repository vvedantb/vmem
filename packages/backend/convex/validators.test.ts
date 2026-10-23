import {
  ARTIFACT_FORMATS,
  ARTIFACT_TYPES,
  mcpTokenCacheFields as packageMcpTokenCacheFields,
} from "@vvedantb/server";
import { v, type Validator } from "convex/values";
import { describe, expect, it } from "vitest";
import { ARTIFACT_REF_KINDS } from "./artifacts/store";
import {
  artifactFormatValidator,
  artifactRefKindValidator,
  artifactTypeValidator,
  mcpTokenCacheFields,
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

describe("mcpTokenCache fields", () => {
  it("match @vvedantb/server mcpTokenCacheFields", () => {
    const shape = (fields: Record<string, Validator<string | number>>) =>
      Object.entries(fields).map(([k, f]) => [k, f.kind, f.isOptional]);
    expect(shape(mcpTokenCacheFields)).toEqual(
      shape(packageMcpTokenCacheFields(v)),
    );
  });
});
