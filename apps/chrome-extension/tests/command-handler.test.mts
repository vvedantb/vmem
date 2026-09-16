// keyboard shortcut save toast and screenshot permission-block path
// AI-generated (Claude), prompt: "unit tests for chrome extension command handler save and screenshot"
// Modified by me: failure toast matches save-toast helper; chrome:// capture is a no-throw
import test from "node:test";
import assert from "node:assert/strict";
import { installChromeMock } from "./helpers/chrome-mock.mts";
import { toastForSaveResult } from "../src/background/save-toast.ts";

const chromeState = installChromeMock();

const { handleCommand, registerCommandListener } =
  await import("../src/background/command-handler.ts");
const { registerContextMenu } =
  await import("../src/background/context-menu.ts");

await test("handleCommand save-page injects the failure toast when extract fails", async () => {
  chromeState.executeScriptCalls.length = 0;
  chromeState.activeTab = {
    id: 7,
    url: "https://example.com/article",
    title: "Article",
  };

  await handleCommand("save-page");

  const toast = toastForSaveResult({
    success: false,
    error: "Failed to extract page content",
  });
  assert.equal(chromeState.executeScriptCalls.length, 1);
  assert.deepEqual(chromeState.executeScriptCalls[0]?.args, [
    toast.message,
    toast.color,
  ]);
  assert.equal(toast.message, "✗ Failed to save page");
});

await test("handleCommand save-page is a no-op without a tab url", async () => {
  chromeState.executeScriptCalls.length = 0;
  chromeState.activeTab = { id: 8 };
  await handleCommand("save-page");
  assert.equal(chromeState.executeScriptCalls.length, 0);
});

await test("handleCommand take-screenshot does not throw on restricted pages", async () => {
  chromeState.activeTab = {
    id: 9,
    url: "chrome://extensions",
    title: "Extensions",
  };
  await handleCommand("take-screenshot");
});

await test("handleCommand take-screenshot is a no-op without a tab id", async () => {
  chromeState.activeTab = { url: "https://example.com" };
  await handleCommand("take-screenshot");
});

await test("registerCommandListener forwards chrome.commands to handleCommand", () => {
  registerCommandListener();
  assert.equal(chromeState.commandListeners.length, 1);
});

await test("registerContextMenu creates save-page and screenshot items", () => {
  registerContextMenu();
  const ids = chromeState.contextMenusCreated.map((item) => item.id);
  assert.deepEqual(ids, ["save-to-vmem", "screenshot-to-vmem"]);
});
