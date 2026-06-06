/** Best-effort message from Convex / Node errors (nested actions often lose text). */
export function formatSyncError(
  err: object | string | null | undefined,
): string {
  if (typeof err === "string" && err.length > 0) return err;
  if (err instanceof Error) {
    if (err.message.length > 0) return err.message;
    return err.name.length > 0 ? err.name : "Unknown sync error";
  }
  if (err !== null && err !== undefined && typeof err === "object") {
    if (
      "message" in err &&
      typeof err.message === "string" &&
      err.message.length > 0
    ) {
      return err.message;
    }
    if ("data" in err && typeof err.data === "string" && err.data.length > 0) {
      return err.data;
    }
  }
  return "Codebase sync failed (possible action timeout on large repos like eva)";
}
