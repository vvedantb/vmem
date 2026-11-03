import {
  isVMemoryError,
  structuredStoreBodySchema,
  VMemory,
  type StructuredStoreBody,
} from "@vmem/sdk";
import type { QueueRow, TrackerApi } from "../../modules/vmem-tracker/src/api";
import { toError } from "../errors";

/** Same limit as `Uploader.MAX_ATTEMPTS` in Kotlin. After it, the user retries by hand. */
export const MAX_ATTEMPTS = 5;

type UploadOutcome = "done" | "no-token" | "auth-failed" | "retry-later";

export interface UploadResult {
  outcome: UploadOutcome;
  uploaded: number;
}

type Poster = (body: StructuredStoreBody) => Promise<void>;

function uploadable(rows: readonly QueueRow[]): QueueRow[] {
  return rows.filter(
    (row) => row.status === "approved" && row.attempts < MAX_ATTEMPTS,
  );
}

/** The stored body, or null when it no longer matches the API contract. */
export function parseBody(row: QueueRow): StructuredStoreBody | null {
  const parsed = structuredStoreBodySchema.safeParse(JSON.parse(row.body));
  return parsed.success ? parsed.data : null;
}

/** Posts with `@vmem/sdk`; the session JWT goes out as the Bearer token. */
export function createPoster(token: string, baseUrl: string): Poster {
  const client = new VMemory({ apiKey: token, baseUrl });
  return async (body) => {
    await client.createMemory(body);
  };
}

interface Failure {
  message: string;
  /** False for errors worth retrying: they do not use up an attempt. */
  countAttempt: boolean;
  stop: UploadOutcome | null;
}

/** Same rules as `Uploader.kt`. */
export function classifyError(error: Error): Failure {
  if (!isVMemoryError(error)) {
    // fetch throws a TypeError when offline.
    return { message: "Offline", countAttempt: false, stop: "retry-later" };
  }
  const { status } = error;
  if (status === 401) {
    return {
      message: "Sign-in expired. Open vmem to send.",
      countAttempt: false,
      stop: "auth-failed",
    };
  }
  if (status === 0 || status === 408 || status === 429 || status >= 500) {
    return {
      message: `HTTP ${String(status)}`,
      countAttempt: false,
      stop: "retry-later",
    };
  }
  return {
    message: `HTTP ${String(status)}: ${error.code}`,
    countAttempt: true,
    stop: null,
  };
}

/**
 * Uploads approved items in order. Stops at the first error that affects
 * every item (offline, 5xx, expired sign-in); other errors count against
 * that item only. The `externalId` in each body makes a repeat safe.
 *
 * `connect` runs only when there is something to send, right before the
 * first post, so the session JWT (about 60 s) is fresh. Null means signed out.
 * A 401 leaves every item `approved` with its attempts unchanged.
 */
export async function uploadApproved(deps: {
  tracker: Pick<TrackerApi, "listQueue" | "markUploaded" | "markFailed">;
  connect: () => Promise<Poster | null>;
}): Promise<UploadResult> {
  const rows = uploadable(await deps.tracker.listQueue());
  if (rows.length === 0) return { outcome: "done", uploaded: 0 };
  const post = await deps.connect();
  if (post === null) return { outcome: "no-token", uploaded: 0 };
  let uploaded = 0;
  for (const row of rows) {
    const body = parseBody(row);
    if (body === null) {
      await deps.tracker.markFailed(row.id, "Invalid item", true);
      continue;
    }
    try {
      await post(body);
      await deps.tracker.markUploaded(row.id);
      uploaded += 1;
    } catch (caught) {
      const failure = classifyError(toError(caught));
      await deps.tracker.markFailed(
        row.id,
        failure.message,
        failure.countAttempt,
      );
      if (failure.stop) return { outcome: failure.stop, uploaded };
    }
  }
  return { outcome: "done", uploaded };
}
