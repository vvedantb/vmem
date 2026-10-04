import { createFileRoute } from "@tanstack/react-router";
import { ExperimentalSettingsClient } from "@/components/settings/ExperimentalSettingsClient";

export const Route = createFileRoute("/_main/settings/experimental")({
  component: ExperimentalSettingsClient,
});
