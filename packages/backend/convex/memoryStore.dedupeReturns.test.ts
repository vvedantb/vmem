/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { register as registerAuditLog } from "convex-audit-log/test";
import { v, type GenericValidator, type Value } from "convex/values";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { createOrUpsertResultValidator } from "./memoryStore/functions";
import { memoryWithTagsValidator } from "./validators";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const USER = "clerk_dedupe_returns_user";

// convex-test 0.0.38 does not enforce `returns` validators, so a field the
// validator lacks (prod: "Object contains extra field `deduped`") passes there.
// This mirrors the server check for the validator kinds the memory rows use.
function returnsError(
  validator: GenericValidator,
  value: Value | undefined,
  path: string,
): string | null {
  const mismatch = `Value does not match validator. Path: ${path || "."}`;
  switch (validator.kind) {
    case "id":
    case "string":
      return typeof value === "string" ? null : mismatch;
    case "float64":
      return typeof value === "number" ? null : mismatch;
    case "int64":
      return typeof value === "bigint" ? null : mismatch;
    case "boolean":
      return typeof value === "boolean" ? null : mismatch;
    case "null":
      return value === null ? null : mismatch;
    case "bytes":
      return value instanceof ArrayBuffer ? null : mismatch;
    case "any":
      return null;
    case "literal":
      return value === validator.value ? null : mismatch;
    case "union":
      return validator.members.some(
        (member) => returnsError(member, value, path) === null,
      )
        ? null
        : mismatch;
    case "array": {
      if (!Array.isArray(value)) return mismatch;
      for (const [index, item] of value.entries()) {
        const error = returnsError(
          validator.element,
          item,
          `${path}[${index}]`,
        );
        if (error) return error;
      }
      return null;
    }
    case "record":
    case "object": {
      if (
        typeof value !== "object" ||
        value === null ||
        Array.isArray(value) ||
        value instanceof ArrayBuffer
      ) {
        return mismatch;
      }
      if (validator.kind === "record") {
        for (const [key, item] of Object.entries(value)) {
          const error = returnsError(validator.value, item, `${path}.${key}`);
          if (error) return error;
        }
        return null;
      }
      const fields: Record<string, GenericValidator> = validator.fields;
      for (const [key, item] of Object.entries(value)) {
        if (item !== undefined && !(key in fields)) {
          return `Object contains extra field \`${key}\` that is not in the validator. Path: ${path || "."}`;
        }
      }
      for (const [key, field] of Object.entries(fields)) {
        const item = value[key];
        if (item === undefined) {
          if (field.isOptional === "required") {
            return `Object is missing the required field \`${key}\`. Path: ${path || "."}`;
          }
          continue;
        }
        const error = returnsError(field, item, `${path}.${key}`);
        if (error) return error;
      }
      return null;
    }
  }
}

function expectReturns(validator: GenericValidator, value: Value) {
  expect(returnsError(validator, value, "")).toBeNull();
}

const storeArgs = {
  userId: USER,
  profileId: "profile_a",
  title: "Prefers pnpm",
  content: "Use pnpm for vmem",
  type: "knowledge" as const,
  source: "mcp",
  tags: ["tooling"],
  confidence: 0.5,
};

describe("returns validator check", () => {
  it("rejects a field the validator lacks, like the server", () => {
    const validator = v.object({ memory: v.object({ id: v.string() }) });
    expect(
      returnsError(validator, { memory: { id: "m1", deduped: true } }, ""),
    ).toBe(
      "Object contains extra field `deduped` that is not in the validator. Path: .memory",
    );
    expect(returnsError(validator, { memory: {} }, "")).toBe(
      "Object is missing the required field `id`. Path: .memory",
    );
  });
});

describe("dedupe results match the real returns validators", () => {
  it("createOrUpsertMemoryInternal returns deduped on a repeat", async () => {
    const t = convexTest(schema, modules);
    const ref = internal.memoryStore.functions.createOrUpsertMemoryInternal;
    const first = await t.mutation(ref, storeArgs);
    const repeat = await t.mutation(ref, storeArgs);

    expect(repeat.memory.id).toBe(first.memory.id);
    expect(repeat.memory.deduped).toBe(true);
    expect(repeat.needsFollowUp).toBe(false);
    expectReturns(createOrUpsertResultValidator, first);
    expectReturns(createOrUpsertResultValidator, repeat);
  });

  it("createMemoryInternal returns deduped on a repeat", async () => {
    const t = convexTest(schema, modules);
    const ref = internal.memoryStore.functions.createMemoryInternal;
    await t.mutation(ref, storeArgs);
    const repeat = await t.mutation(ref, storeArgs);

    expect(repeat.deduped).toBe(true);
    expectReturns(memoryWithTagsValidator, repeat);
  });

  describe("public create paths", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    async function signedIn() {
      const t = convexTest(schema, modules);
      registerAuditLog(t);
      const user = t.withIdentity({
        subject: USER,
        email: "dedupe-returns@example.com",
        name: "dedupe-returns@example.com",
      });
      await user.mutation(api.auth.ensureUserExists, {});
      const profile = await user.mutation(api.profiles.getOrCreateDefault, {});
      if (!profile) throw new Error("profile missing");
      const args = {
        title: storeArgs.title,
        content: storeArgs.content,
        type: storeArgs.type,
        source: storeArgs.source,
        tags: storeArgs.tags,
        confidence: 1,
        profileId: profile._id,
      };
      return { user, args };
    }

    it("memoryApi.create returns deduped on a repeat", async () => {
      const { user, args } = await signedIn();
      const first = await user.mutation(api.memoryApi.create, args);
      const repeat = await user.mutation(api.memoryApi.create, args);

      expect(repeat.id).toBe(first.id);
      expect(repeat.deduped).toBe(true);
      expectReturns(memoryWithTagsValidator, repeat);
    });

    // HTTP POST /api/v1/memories and MCP memory_add / memory_add_batch all
    // write through createMemoryForClerk, which this action calls
    it("memoryApi.createMemory returns deduped on a repeat", async () => {
      const { user, args } = await signedIn();
      const first = await user.action(api.memoryApi.createMemory, args);
      const repeat = await user.action(api.memoryApi.createMemory, {
        ...args,
        source: "sdk",
      });

      expect(repeat.id).toBe(first.id);
      expect(repeat.deduped).toBe(true);
      expectReturns(memoryWithTagsValidator, repeat);
    });
  });
});
