// Adapted from unblocked/context-engine-simulator (MIT, Copyright 2026 Unblocked)
// https://github.com/unblocked/context-engine-simulator
// The ContaminationError / banned-server idea follows its stream guard.

import type { Arm } from "./types.ts";

// Case-insensitive substrings of MCP server names.
const DEFAULT_BANNED_FRAGMENTS: readonly string[] = [
  "mem0",
  "supermemory",
  "super-memory",
  "zep",
  "graphiti",
  "memorybank",
  "memory-bank",
  "memgpt",
  "letta",
  "chatgpt-memory",
  "notion",
  "raven",
  "memos",
];

export class ContaminationError extends Error {
  readonly arm: Arm;
  readonly server: string;
  readonly fragment: string;

  constructor(arm: Arm, server: string, fragment: string) {
    super(
      `Contamination on arm "${arm}": MCP server "${server}" matches banned fragment "${fragment}"`,
    );
    this.name = "ContaminationError";
    this.arm = arm;
    this.server = server;
    this.fragment = fragment;
  }
}

export function bannedFragments(arm: Arm): string[] {
  return arm === "off"
    ? [...DEFAULT_BANNED_FRAGMENTS, "vmem"]
    : [...DEFAULT_BANNED_FRAGMENTS];
}

export function findBannedFragment(
  server: string,
  fragments: readonly string[],
): string | null {
  const name = server.toLowerCase();
  return (
    fragments.find((fragment) => name.includes(fragment.toLowerCase())) ?? null
  );
}

// Returns a checker. It returns the first violation (or null) and calls
// onContamination once per violation so callers can abort the child process.
export function createContaminationGuard(
  arm: Arm,
  onContamination?: (error: ContaminationError) => void,
): (servers: readonly string[]) => ContaminationError | null {
  const fragments = bannedFragments(arm);
  return (servers) => {
    for (const server of servers) {
      const fragment = findBannedFragment(server, fragments);
      if (fragment === null) continue;
      const error = new ContaminationError(arm, server, fragment);
      onContamination?.(error);
      return error;
    }
    return null;
  };
}
