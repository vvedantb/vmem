import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Legacy `/openrouter-logs` route — preserved as a redirect so existing
 * bookmarks and external links keep working after the move into
 * `/activity/ai-logs`. The label "OpenRouter" leaked the implementation
 * detail of which provider we route AI calls through; "AI Logs" is
 * provider-agnostic.
 */
export const Route = createFileRoute("/_main/openrouter-logs/")({
  beforeLoad: () => {
    throw redirect({ to: "/activity/ai-logs" });
  },
  component: () => null,
});
