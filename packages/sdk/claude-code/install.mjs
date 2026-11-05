#!/usr/bin/env node
// Add the vmem SessionEnd hook to Claude Code user settings
// (~/.claude/settings.json). Keeps all other settings and hooks. Running it
// again replaces the old vmem hook, so it is never added twice.
// Usage: node install.mjs [--settings <path>]

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { objectSchema } from "./schemas.mjs";

const HOOK_SCRIPT = fileURLToPath(
  new URL("submit-session.mjs", import.meta.url),
);
// Marks a command as ours, also when an older install used another path.
const HOOK_MARKER = "claude-code/submit-session.mjs";
const HOOK_TIMEOUT_SECONDS = 15;

/**
 * The hook command for the script at `scriptPath`.
 * @param {string} scriptPath
 * @returns {string}
 */
export function hookCommand(scriptPath) {
  return `node ${JSON.stringify(scriptPath)}`;
}

/**
 * `settings` with exactly one vmem SessionEnd hook. Pure.
 * @param {Record<string, unknown>} settings
 * @param {string} command
 * @returns {Record<string, unknown>}
 */
export function withSessionEndHook(settings, command) {
  const hooks = objectSchema.is(settings.hooks) ? settings.hooks : {};
  const groups = Array.isArray(hooks.SessionEnd) ? hooks.SessionEnd : [];
  const kept = groups
    .map((group) => {
      if (!objectSchema.is(group) || !Array.isArray(group.hooks)) return group;
      return {
        ...group,
        hooks: group.hooks.filter((hook) => !isVmemHook(hook)),
      };
    })
    .filter(
      (group) =>
        !objectSchema.is(group) ||
        !Array.isArray(group.hooks) ||
        group.hooks.length > 0,
    );
  const vmemGroup = {
    hooks: [
      {
        type: "command",
        command,
        async: true,
        timeout: HOOK_TIMEOUT_SECONDS,
      },
    ],
  };
  return {
    ...settings,
    hooks: { ...hooks, SessionEnd: [...kept, vmemGroup] },
  };
}

/**
 * @param {unknown} hook
 * @returns {boolean}
 */
function isVmemHook(hook) {
  return (
    objectSchema.is(hook) &&
    typeof hook.command === "string" &&
    hook.command.replaceAll("\\", "/").includes(HOOK_MARKER)
  );
}

/**
 * @param {string} path
 * @returns {Promise<Record<string, unknown>>}
 */
async function readSettings(path) {
  if (!existsSync(path)) return {};
  const raw = await readFile(path, "utf8");
  if (raw.trim() === "") return {};
  try {
    return objectSchema.parse(JSON.parse(raw));
  } catch (error) {
    throw new Error(`${path} is not a valid JSON object, left unchanged`, {
      cause: error,
    });
  }
}

async function main() {
  const flag = process.argv.indexOf("--settings");
  const settingsPath =
    flag === -1
      ? join(homedir(), ".claude", "settings.json")
      : process.argv[flag + 1];
  if (!settingsPath) throw new Error("--settings needs a path");

  const settings = await readSettings(settingsPath);
  const next = withSessionEndHook(settings, hookCommand(HOOK_SCRIPT));
  await mkdir(dirname(settingsPath), { recursive: true });
  await writeFile(settingsPath, `${JSON.stringify(next, null, 2)}\n`);

  console.info(`vmem SessionEnd hook installed in ${settingsPath}`);
  console.info(`  command: ${hookCommand(HOOK_SCRIPT)}`);
  console.info("");
  console.info("Next steps:");
  console.info("  1. Create an API key in vmem (Settings → API → Keys).");
  console.info("  2. Export these in the shell that starts Claude Code:");
  console.info('       export VMEM_API_KEY="vmem_sk_..."');
  console.info(
    '       export VMEM_BASE_URL="https://<deployment>.convex.site"',
  );
  console.info(
    "  3. End a Claude Code session with 3+ user turns. The outcome is in",
  );
  console.info("     ~/.claude/vmem-transcript-hook.log.");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    console.error(
      `vmem hook install failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }
}
