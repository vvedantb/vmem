/**
 * Memory-graph renderer feature flag (DEFAULT OFF).
 *
 * Enable Cosmos GL either:
 *   localStorage.setItem("vmem.graphRenderer", "cosmos")
 * or
 *   VITE_GRAPH_RENDERER=cosmos
 *
 * Clear with localStorage.removeItem("vmem.graphRenderer") / unset the env var.
 */
export function isCosmosGraphRendererEnabled(): boolean {
  if (import.meta.env.VITE_GRAPH_RENDERER === "cosmos") return true;
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem("vmem.graphRenderer") === "cosmos";
}
