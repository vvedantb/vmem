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
  background: "#ebebee",
  color: "#2a2a2f",
  border: "none",
  borderRadius: "12px",
  padding: "8px 16px",
  fontSize: "14px",
  fontWeight: "500",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: "8px",
  fontFamily: "'Instrument Sans', system-ui, -apple-system, sans-serif",
  boxShadow: "0 1px 2px rgba(16,24,40,0.06), 0 10px 28px rgba(16,24,40,0.06)",
  transition: "all 240ms cubic-bezier(0.22,1,0.36,1)",
  letterSpacing: "0",
  lineHeight: "1",
  height: "40px",
  whiteSpace: "nowrap",
} as const;
