import { createFileRoute } from "@tanstack/react-router";
import ImportPageClient from "@/components/settings/ImportPageClient";

export const Route = createFileRoute("/_main/settings/data-controls/import")({
  component: ImportRoute,
});

function ImportRoute() {
  return <ImportPageClient />;
}
