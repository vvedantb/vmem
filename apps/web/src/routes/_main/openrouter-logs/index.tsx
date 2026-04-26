import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Legacy `/openrouter-logs` route — preserved as a redirect so existing
 * bookmarks and external links keep working after the rename to `/ai-logs`.
 * The label "OpenRouter" leaked the implementation detail of which provider
 * we route AI calls through; "AI Logs" is provider-agnostic.
 */
export const Route = createFileRoute("/_main/openrouter-logs/")({
  beforeLoad: () => {
    throw redirect({ to: "/ai-logs" });
  },
  component: () => null,
});
