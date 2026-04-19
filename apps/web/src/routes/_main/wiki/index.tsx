import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import WikiWorkspace from "@/components/wiki/WikiWorkspace";

export const Route = createFileRoute("/_main/wiki/")({
  component: WikiPage,
});

function WikiPage() {
  return (
    <Suspense fallback={null}>
      <WikiWorkspace docId={null} />
    </Suspense>
  );
}
