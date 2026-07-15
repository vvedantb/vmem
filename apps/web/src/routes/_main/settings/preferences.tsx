import { createFileRoute } from "@tanstack/react-router";
import { PreferencesPage } from "@/components/settings/preferences/PreferencesPage";

export const Route = createFileRoute("/_main/settings/preferences")({
  component: PreferencesPage,
});
