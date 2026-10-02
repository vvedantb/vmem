import { getFunctionName } from "convex/server";
import { z } from "zod";
import type { Id } from "../../convex/_generated/dataModel";
import type { ActionCtx } from "../../convex/_generated/server";
import type { SyncedDoc } from "../../convex/connectors/syncShared";

type ConvexFnRef = Parameters<typeof getFunctionName>[0];

const connectorIdSchema = z.custom<Id<"connectors">>(
  (v) => typeof v === "string",
);

export const TEST_CONNECTOR_ID = connectorIdSchema.parse("connector_test");
export const TEST_CLERK_ID = "clerk_connector_user";

export type RecordedMutation = { name: string; args: unknown };

export type FakeSyncCtx = {
  ctx: ActionCtx;
  mutations: RecordedMutation[];
  upserted: () => unknown[];
};

function isActionCtx(value: object): value is ActionCtx {
  return "runQuery" in value && "runMutation" in value && "runAction" in value;
}

// records connector sync mutations without a convex deployment
export function createFakeSyncCtx(): FakeSyncCtx {
  const mutations: RecordedMutation[] = [];
  const ctx = {
    runQuery: async () => null,
    runAction: async () => null,
    runMutation: async (ref: ConvexFnRef, args: unknown) => {
      const name = getFunctionName(ref);
      mutations.push({ name, args });
      if (name === "profiles:getOrCreateDefaultByClerkIdInternal") {
        return { _id: "profile_default" };
      }
      return null;
    },
  };
  if (!isActionCtx(ctx)) throw new Error("fake ActionCtx is incomplete");
  return {
    ctx,
    mutations,
    upserted: () =>
      mutations
        .filter(
          (m) =>
            m.name === "memoryStore/functions:upsertMemoryFromSourceInternal",
        )
        .map((m) => m.args),
  };
}

export function jsonResponse(
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "Content-Type": "application/json", ...init.headers },
  });
}

export function docIds(docs: SyncedDoc[]): string[] {
  return docs.map((doc) => doc.sourceId);
}
