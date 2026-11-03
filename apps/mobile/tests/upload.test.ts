import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { VMemoryError, type StructuredStoreBody } from "@vmem/sdk";
import type { QueueRow } from "../modules/vmem-tracker/src/api";
import {
  classifyError,
  MAX_ATTEMPTS,
  uploadApproved,
} from "../src/sync/upload";

function row(id: number, patch: Partial<QueueRow> = {}): QueueRow {
  const body: StructuredStoreBody = {
    title: `Item ${String(id)}`,
    content: "content",
    type: "episodic",
    source: "android",
    sourceType: "android",
    tags: ["android"],
    externalId: `android:test:${String(id)}`,
  };
  return {
    id,
    kind: "app_usage",
    status: "approved",
    externalId: body.externalId ?? "",
    body: JSON.stringify(body),
    startMs: id,
    endMs: id,
    createdAt: 0,
    updatedAt: 0,
    attempts: 0,
    lastError: null,
    ...patch,
  };
}

function fakeTracker(rows: QueueRow[]) {
  const uploaded: number[] = [];
  const failed: { id: number; error: string; countAttempt: boolean }[] = [];
  return {
    uploaded,
    failed,
    tracker: {
      listQueue: () => Promise.resolve(rows),
      markUploaded: (id: number) => {
        uploaded.push(id);
        return Promise.resolve();
      },
      markFailed: (id: number, error: string, countAttempt: boolean) => {
        failed.push({ id, error, countAttempt });
        return Promise.resolve();
      },
    },
  };
}

describe("uploadApproved", () => {
  it("posts approved rows only, in order, and marks them uploaded", async () => {
    const fake = fakeTracker([
      row(1),
      row(2, { status: "pending_review" }),
      row(3, { status: "uploaded" }),
      row(4),
      row(5, { attempts: MAX_ATTEMPTS }),
    ]);
    const posted: string[] = [];
    const result = await uploadApproved({
      tracker: fake.tracker,
      post: (body) => {
        posted.push(body.externalId ?? "");
        return Promise.resolve();
      },
    });
    assert.deepEqual(result, { outcome: "done", uploaded: 2 });
    assert.deepEqual(posted, ["android:test:1", "android:test:4"]);
    assert.deepEqual(fake.uploaded, [1, 4]);
  });

  it("waits for a token without touching rows", async () => {
    const fake = fakeTracker([row(1)]);
    assert.deepEqual(
      await uploadApproved({ tracker: fake.tracker, post: null }),
      {
        outcome: "no-token",
        uploaded: 0,
      },
    );
    assert.deepEqual(fake.failed, []);
  });

  it("stops on an expired sign-in and keeps the attempt", async () => {
    const fake = fakeTracker([row(1), row(2)]);
    const result = await uploadApproved({
      tracker: fake.tracker,
      post: () => Promise.reject(new VMemoryError("nope", 401, "unauthorized")),
    });
    assert.deepEqual(result, { outcome: "auth-failed", uploaded: 0 });
    assert.equal(fake.failed.length, 1);
    assert.equal(fake.failed[0]?.countAttempt, false);
  });

  it("counts a rejected item and carries on with the next", async () => {
    const fake = fakeTracker([row(1), row(2)]);
    const result = await uploadApproved({
      tracker: fake.tracker,
      post: (body) =>
        body.externalId === "android:test:1"
          ? Promise.reject(new VMemoryError("bad", 400, "invalid_request"))
          : Promise.resolve(),
    });
    assert.deepEqual(result, { outcome: "done", uploaded: 1 });
    assert.deepEqual(fake.failed, [
      { id: 1, error: "HTTP 400: invalid_request", countAttempt: true },
    ]);
  });

  it("marks a corrupt body and does not post it", async () => {
    const fake = fakeTracker([row(1, { body: '{"title":1}' })]);
    let posts = 0;
    await uploadApproved({
      tracker: fake.tracker,
      post: () => {
        posts += 1;
        return Promise.resolve();
      },
    });
    assert.equal(posts, 0);
    assert.deepEqual(fake.failed, [
      { id: 1, error: "Invalid item", countAttempt: true },
    ]);
  });
});

describe("classifyError", () => {
  it("retries offline and server errors without using an attempt", () => {
    assert.deepEqual(classifyError(new TypeError("Network request failed")), {
      message: "Offline",
      countAttempt: false,
      stop: "retry-later",
    });
    assert.equal(
      classifyError(new VMemoryError("x", 503, "unavailable")).stop,
      "retry-later",
    );
    assert.equal(
      classifyError(new VMemoryError("x", 429, "rate_limited")).countAttempt,
      false,
    );
  });
});
