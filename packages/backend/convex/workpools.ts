import { Workpool } from "@convex-dev/workpool";
import { components } from "./_generated/api";

const syncRetryBehavior = {
  maxAttempts: 4,
  initialBackoffMs: 500,
  base: 2,
};

export const connectorSyncPool = new Workpool(components.connectorSyncPool, {
  maxParallelism: 1,
  retryActionsByDefault: true,
  defaultRetryBehavior: syncRetryBehavior,
});
