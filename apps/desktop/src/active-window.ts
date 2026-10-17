import { z } from "zod";
import type { ActiveWindow } from "./blocklist";

const activeWindowSchema = z.object({
  title: z.string(),
  owner: z.object({ name: z.string() }),
});

/**
 * Reads the focused window through `get-windows`, which scripts/build.mjs
 * bundles. The import is lazy, so a native load failure throws from this call
 * and the caller can log it. A headless display may return null.
 * Permission prompts are off: without macOS permissions titles may be empty.
 */
export async function getActiveWindow(): Promise<ActiveWindow | null> {
  const { activeWindow } = await import("get-windows");
  const result = await activeWindow({
    accessibilityPermission: false,
    screenRecordingPermission: false,
  });
  const parsed = activeWindowSchema.safeParse(result);
  return parsed.success
    ? { app: parsed.data.owner.name, title: parsed.data.title }
    : null;
}
