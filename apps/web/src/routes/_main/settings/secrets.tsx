import { createFileRoute } from "@tanstack/react-router";
import { SecretsClient } from "@/components/settings/SecretsClient";

export const Route = createFileRoute("/_main/settings/secrets")({
  component: SecretsClient,
});
