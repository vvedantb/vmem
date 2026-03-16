export const API_VERSION = "v1";

export const CLERK_PUBLISHABLE_KEY =
  "pk_test_ZmxleGlibGUtZHVja2xpbmctNzQuY2xlcmsuYWNjb3VudHMuZGV2JA";

export const CONVEX_URL =
  "https://outgoing-reindeer-268.eu-west-1.convex.cloud";

export const DEFAULT_API_URL = "https://vmem-api.up.railway.app";

export const CLERK_SYNC_HOST = "http://localhost:3000";

export const EXPORT_PROMPT = `Please save a comprehensive summary of our entire conversation to vmem. Include:
- All key decisions made
- Important facts and context discussed
- Action items or conclusions
- Any preferences or requirements mentioned

Use the vmem MCP tools to create appropriate memories with relevant tags.`;

export const VMEM_BUTTON_STYLES = {
  background: "#6366f1",
  color: "#ffffff",
  border: "none",
  borderRadius: "6px",
  padding: "6px 12px",
  fontSize: "13px",
  fontWeight: "500",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: "4px",
  fontFamily: "system-ui, -apple-system, sans-serif",
} as const;
