/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal } from "../../convex/_generated/api";
import schema from "../../convex/schema";

const modules = import.meta.glob("../../convex/**/*.ts");

const USER = "clerk_connector_user";
const PROFILE = "profile_connector";

const CASES = [
  {
    sourceType: "gmail",
    sourceId: "18c2f0a1b2c3d4e5",
    sourceUrl: "https://mail.google.com/mail/u/0/#inbox/18c2f0a1b2c3d4e5",
  },
  {
    sourceType: "figma",
    sourceId: "AbCdEfFileKey",
    sourceUrl: "https://www.figma.com/file/AbCdEfFileKey",
  },
  {
    sourceType: "github",
    sourceId: "I_kwDOAbCd1234",
    sourceUrl: "https://github.com/acme/app/issues/42",
  },
] as const;

describe("upsertMemoryFromSourceInternal for new connectors", () => {
  it.each(CASES)(
    "inserts then updates the same $sourceType sourceId",
    async ({ sourceType, sourceId, sourceUrl }) => {
      const t = convexTest(schema, modules);

      const first = await t.mutation(
        internal.memoryStore.functions.upsertMemoryFromSourceInternal,
        {
          userId: USER,
          profileId: PROFILE,
          title: `${sourceType} item`,
          content: "first body",
          sourceType,
          sourceId,
          sourceUrl,
        },
      );
      expect(first.source).toBe(sourceType);
      expect(first.title).toBe(`${sourceType} item`);

      const second = await t.mutation(
        internal.memoryStore.functions.upsertMemoryFromSourceInternal,
        {
          userId: USER,
          profileId: PROFILE,
          title: `${sourceType} item updated`,
          content: "second body",
          sourceType,
          sourceId,
          sourceUrl,
        },
      );
      expect(second.id).toBe(first.id);
      expect(second.title).toBe(`${sourceType} item updated`);
      expect(second.content).toBe("second body");

      const listed = await t.query(
        internal.memoryStore.functions.listMemoriesInternal,
        { userId: USER, profileId: PROFILE, limit: 10, offset: 0 },
      );
      expect(listed.total).toBe(1);
    },
  );
});
