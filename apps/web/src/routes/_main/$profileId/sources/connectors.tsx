import { createFileRoute } from "@tanstack/react-router";
import { ConnectorsScreen } from "@/routes/_main/settings/connectors";

export const Route = createFileRoute("/_main/$profileId/sources/connectors")({
  component: ConnectorsScreen,
});
