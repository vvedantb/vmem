import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import FilesClient from "@/components/files/FilesClient";

export const Route = createFileRoute("/_main/$profileId/files")({
  component: FilesPage,
});

function FilesPage() {
  return (
    <Suspense>
      <FilesClient />
    </Suspense>
  );
}
