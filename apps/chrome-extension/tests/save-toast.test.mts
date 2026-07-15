import test from "node:test";
import assert from "node:assert/strict";
import { toastForSaveResult } from "../src/background/save-toast.ts";

await test("toastForSaveResult shows success toast only when success is true", () => {
  assert.deepEqual(toastForSaveResult({ success: true, memoryId: "m1" }), {
    message: "✓ Page saved to vmem",
    color: "#4ade80",
  });
});

await test("toastForSaveResult shows failure toast when success is false", () => {
  assert.deepEqual(
    toastForSaveResult({
      success: false,
      error: "Failed to extract page content",
    }),
    {
      message: "✗ Failed to save page",
      color: "#f87171",
    },
  );
});
