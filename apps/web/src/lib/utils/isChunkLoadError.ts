/** Detects errors caused by stale JavaScript chunks after a new deployment. */
export function isChunkLoadError(error: Error): boolean {
  const msg = error.message;
  return (
    error.name === "ChunkLoadError" ||
    msg.includes("Failed to fetch dynamically imported module") ||
    msg.includes("Importing a module script failed") ||
    msg.includes("Loading chunk") ||
    msg.includes("Loading CSS chunk")
  );
}
