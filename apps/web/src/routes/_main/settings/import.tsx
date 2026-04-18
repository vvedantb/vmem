import { createFileRoute } from "@tanstack/react-router";
import ImportPageClient from "@/components/settings/ImportPageClient";

export const Route = createFileRoute("/_main/settings/import")({
  component: ImportSettingsPage,
});

function ImportSettingsPage() {
  return <ImportPageClient />;
}
