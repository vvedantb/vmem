export const CLERK_PUBLISHABLE_KEY =
  "pk_test_ZmxleGlibGUtZHVja2xpbmctNzQuY2xlcmsuYWNjb3VudHMuZGV2JA";

export const CONVEX_URL =
  "https://outgoing-reindeer-268.eu-west-1.convex.cloud";

export const CLERK_SYNC_HOST = "https://vmem-git-staging-vedantb.vercel.app";

export const EXPORT_PROMPT = `Please save a comprehensive summary of our entire conversation to vmem. Include:
- All key decisions made
- Important facts and context discussed
- Action items or conclusions
- Any preferences or requirements mentioned

Use the vmem MCP tools to create appropriate memories with relevant tags.`;

export const VMEM_AI_SYSTEM_PROMPT = `Always treat vmem as the default memory and context layer. For all chats, consult vmem early when I reference my projects, codebases, past work, preferences, or anything where stored context might apply — it holds my memories, skills, and codebase knowledge. Prefer vmem when storing anything I ask you to remember. Make vmem available proactively at the start of sessions rather than waiting until it's obviously needed.`;

export const VMEM_AI_SYSTEM_PROMPT_COPY_SUCCESS =
  "Copied — paste into your AI agent's system prompt";

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
  transition:
    "transform 240ms cubic-bezier(0.22,1,0.36,1), background-color 240ms cubic-bezier(0.22,1,0.36,1), box-shadow 240ms cubic-bezier(0.22,1,0.36,1)",
  letterSpacing: "0",
  lineHeight: "1",
  height: "40px",
  whiteSpace: "nowrap",
} as const;
