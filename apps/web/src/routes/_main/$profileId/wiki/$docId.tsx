import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import WikiWorkspace from "@/components/wiki/WikiWorkspace";

export const Route = createFileRoute("/_main/$profileId/wiki/$docId")({
  component: WikiDocPage,
});

function WikiDocPage() {
  const { docId } = Route.useParams();
  return (
    <Suspense fallback={null}>
      <WikiWorkspace docId={docId} />
    </Suspense>
  );
}
