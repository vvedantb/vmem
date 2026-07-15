import { Workpool } from "@convex-dev/workpool";
import { components } from "./_generated/api";

// Matches prior ActionRetrier defaults: 500ms * 2^n, up to 4 attempts.
const syncRetryBehavior = {
  maxAttempts: 4,
  initialBackoffMs: 500,
  base: 2,
};

// Serial connector ingest — one provider sync at a time.
export const connectorSyncPool = new Workpool(components.connectorSyncPool, {
  maxParallelism: 1,
  retryActionsByDefault: true,
  defaultRetryBehavior: syncRetryBehavior,
});

// Serial codebase sync / Neo4j cleanup — one repo job at a time.
export const codebaseSyncPool = new Workpool(components.codebaseSyncPool, {
  maxParallelism: 1,
  retryActionsByDefault: true,
  defaultRetryBehavior: syncRetryBehavior,
});
