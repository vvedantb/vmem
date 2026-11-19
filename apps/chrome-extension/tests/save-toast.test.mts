// AI-generated (Claude), prompt: "write unit tests for chrome extension save toast success and failure messages"
// Modified by me: tightened assert messages and colors
import test from "node:test";
import assert from "node:assert/strict";
import { toastForSaveResult } from "../src/background/save-toast.ts";

await test("toastForSaveResult shows success toast only when success is true", () => {
  assert.deepEqual(
    toastForSaveResult({
      success: true,
      memoryId: "m1",
      memoryUrl: "https://vmem.projectv.uk/memories/list/m1",
    }),
    {
      type: "success",
      message: "Saved to vmem",
      openUrl: "https://vmem.projectv.uk/memories/list/m1",
    },
  );
});

await test("toastForSaveResult says already saved on a repeat save", () => {
  assert.deepEqual(
    toastForSaveResult({ success: true, memoryId: "m1", alreadySaved: true }),
    { type: "success", message: "Already saved", openUrl: undefined },
  );
});

await test("toastForSaveResult shows failure toast when success is false", () => {
  assert.deepEqual(
    toastForSaveResult({
      success: false,
      error: "Failed to extract page content",
    }),
    { type: "error", message: "Failed to save page" },
  );
});
