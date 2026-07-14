"use client";

import { createFileRoute } from "@tanstack/react-router";
import { KeysPanel } from "./-components/KeysPanel";

export const Route = createFileRoute("/_main/settings/api/keys")({
  component: KeysRoute,
});

function KeysRoute() {
  return <KeysPanel />;
}
