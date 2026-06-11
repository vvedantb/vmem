import { createFileRoute, Navigate } from "@tanstack/react-router";

/**
 * Bare `/$profileId` → that workspace's home. Component-level (not
 * `beforeLoad`) so the layout's legacy-segment check renders first for
 * single-segment legacy URLs like `/chat`.
 */
export const Route = createFileRoute("/_main/$profileId/")({
  component: WorkspaceIndexRedirect,
});

function WorkspaceIndexRedirect() {
  const { profileId } = Route.useParams();
  return <Navigate to="/$profileId/home" params={{ profileId }} replace />;
}
