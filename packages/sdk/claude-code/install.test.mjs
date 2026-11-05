import assert from "node:assert/strict";
import { test } from "node:test";
import { hookCommand, withSessionEndHook } from "./install.mjs";

const command = hookCommand(
  "/opt/vmem/packages/sdk/claude-code/submit-session.mjs",
);

void test("adds an async SessionEnd hook and keeps other settings", () => {
  const other = { hooks: [{ type: "command", command: "echo bye" }] };
  const next = withSessionEndHook(
    { model: "opus", hooks: { PreToolUse: [], SessionEnd: [other] } },
    command,
  );
  assert.equal(next.model, "opus");
  assert.deepEqual(next.hooks, {
    PreToolUse: [],
    SessionEnd: [
      other,
      { hooks: [{ type: "command", command, async: true, timeout: 15 }] },
    ],
  });
});

void test("is idempotent and replaces an old install path", () => {
  const old = withSessionEndHook(
    {},
    hookCommand("/old/claude-code/submit-session.mjs"),
  );
  const once = withSessionEndHook(old, command);
  const twice = withSessionEndHook(once, command);
  assert.deepEqual(twice, once);
  assert.deepEqual(once.hooks, {
    SessionEnd: [
      { hooks: [{ type: "command", command, async: true, timeout: 15 }] },
    ],
  });
});
