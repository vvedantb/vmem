import { createFileRoute } from "@tanstack/react-router";
import { WorkspaceEntryRedirect } from "@/components/workspace/WorkspaceEntryRedirect";

// `/home` is the post-login entry point (Clerk's signInFallbackRedirectUrl).
export const Route = createFileRoute("/_main/home")({
  component: WorkspaceEntry,
});

function WorkspaceEntry() {
  return <WorkspaceEntryRedirect subPath="/home" />;
}
