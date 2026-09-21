import { createFileRoute } from "@tanstack/react-router";
import { WorkspaceEntryRedirect } from "@/components/workspace/WorkspaceEntryRedirect";

// Bookmarks to the old import tab land on Sources → Import.
export const Route = createFileRoute("/_main/settings/data-controls/import")({
  component: ImportRedirect,
});

function ImportRedirect() {
  return <WorkspaceEntryRedirect subPath="/sources/import" />;
}
