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

// nightly maintenance: one runUser action per user, two at a time so a big
// user list does not stampede the gateway. No retries; each step handles its own.
export const nightlyPool = new Workpool(components.nightlyPool, {
  maxParallelism: 2,
  retryActionsByDefault: false,
});
