export const CLERK_PUBLISHABLE_KEY =
  import.meta.env?.VITE_CLERK_PUBLISHABLE_KEY ??
  "pk_test_ZmxleGlibGUtZHVja2xpbmctNzQuY2xlcmsuYWNjb3VudHMuZGV2JA";

export const CONVEX_URL =
  import.meta.env?.VITE_CONVEX_URL ??
  "https://outgoing-reindeer-268.eu-west-1.convex.cloud";

export const CLERK_SYNC_HOST =
  import.meta.env?.VITE_CLERK_SYNC_HOST ??
  "https://vmem-git-staging-vedantb.vercel.app";

export const EXPORT_PROMPT = `Please save a comprehensive summary of our entire conversation to vmem. Include:
- All key decisions made
- Important facts and context discussed
- Action items or conclusions
- Any preferences or requirements mentioned

Use the vmem MCP tools to create appropriate memories with relevant tags.`;

export const VMEM_AI_SYSTEM_PROMPT = `Always treat vmem as the default memory and context layer. It holds my memories, skills, and codebase knowledge.
On the first turn of every conversation, query vmem before producing any user-visible text. This is a precondition, not a decision — treat it like reading a file before editing. No exceptions for casual chat, greetings, or questions that seem unrelated to my projects; my stored context spans media, browsing, and personal life, not just code. The memory summary in your system prompt is stale and partial and is not a substitute for a live query.
Re-query when the conversation shifts to a new topic, entity, or project. Prefer vmem when storing anything I ask you to remember, and proactively store durable facts, preferences, decisions, and project context without being asked.
If you catch yourself reasoning about whether to skip vmem because the topic is "casual," "general," "unrelated to my work," or because you "already have enough context" — that reasoning is wrong by construction. Query first, then continue.`;

export const VMEM_AI_SYSTEM_PROMPT_COPY_SUCCESS =
  "Copied — paste into your AI agent's system prompt";

// sync interval presets shared by popup and background
export const MIN_SYNC_INTERVAL_MINUTES = 15;
export const MAX_SYNC_INTERVAL_MINUTES = 1440; // one day
export const DEFAULT_SYNC_INTERVAL_MINUTES = 30;

// selectable sync periods in minutes
export const SYNC_INTERVAL_PRESETS = [
  15, 30, 60, 120, 240, 360, 720, 1440,
] as const;

// settings label for sync interval
export function describeSyncInterval(minutes: number): string {
  if (minutes < 60) return `Every ${minutes} minutes`;
  const hours = minutes / 60;
  return hours === 1 ? "Every hour" : `Every ${hours} hours`;
}

// compact badge label for sync interval
export function shortSyncInterval(minutes: number): string {
  return minutes < 60 ? `${minutes}m` : `${minutes / 60}h`;
}

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
