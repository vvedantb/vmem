import { createFileRoute } from "@tanstack/react-router";
import PlaygroundClient from "@/components/settings/PlaygroundClient";

export const Route = createFileRoute("/_main/settings/playground/")({
  component: PlaygroundPage,
});

function PlaygroundPage() {
  return <PlaygroundClient />;
}
