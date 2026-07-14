import { createFileRoute, Navigate } from "@tanstack/react-router";

// bare `/$profileId` → that workspace's home
export const Route = createFileRoute("/_main/$profileId/")({
  component: WorkspaceIndexRedirect,
});

function WorkspaceIndexRedirect() {
  const { profileId } = Route.useParams();
  return <Navigate to="/$profileId/home" params={{ profileId }} replace />;
}
