import { createFileRoute } from "@tanstack/react-router";
import { ExtensionSettingsClient } from "@/components/settings/ExtensionSettingsClient";

export const Route = createFileRoute("/_main/settings/extension")({
  component: ExtensionSettingsClient,
});
