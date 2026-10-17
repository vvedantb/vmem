import { execFile, execFileSync } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";
import { nativeDir } from "./dir";

/**
 * Replaces `get-windows/lib/macos.js` in the bundle (see scripts/build.mjs).
 * Upstream runs `../main` relative to its own folder, which is wrong after
 * bundling. This runs the copied Swift binary from a fixed path instead.
 */
const run = promisify(execFile);
const binary = join(nativeDir, "main");

interface Options {
  accessibilityPermission?: boolean;
  screenRecordingPermission?: boolean;
}

function args(options: Options | undefined, extra: string[] = []): string[] {
  const out: string[] = [];
  if (options?.accessibilityPermission === false) {
    out.push("--no-accessibility-permission");
  }
  if (options?.screenRecordingPermission === false) {
    out.push("--no-screen-recording-permission");
  }
  return [...out, ...extra];
}

function parse(stdout: string): unknown {
  try {
    const parsed: unknown = JSON.parse(stdout);
    return parsed;
  } catch {
    throw new Error("Error parsing window data");
  }
}

export async function activeWindow(options?: Options): Promise<unknown> {
  return parse((await run(binary, args(options))).stdout);
}

export function activeWindowSync(options?: Options): unknown {
  return parse(execFileSync(binary, args(options), { encoding: "utf8" }));
}

export async function openWindows(options?: Options): Promise<unknown> {
  return parse(
    (await run(binary, args(options, ["--open-windows-list"]))).stdout,
  );
}

export function openWindowsSync(options?: Options): unknown {
  return parse(
    execFileSync(binary, args(options, ["--open-windows-list"]), {
      encoding: "utf8",
    }),
  );
}
