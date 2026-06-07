"use client";

import { createFileRoute } from "@tanstack/react-router";
import { KeysPanel } from "./-components/KeysPanel";
import { useApiCreateKeyModal } from "./-components/ApiCreateKeyContext";

export const Route = createFileRoute("/_main/settings/api/keys")({
  component: KeysRoute,
});

function KeysRoute() {
  const { isCreateModalOpen, setIsCreateModalOpen } = useApiCreateKeyModal();

  return (
    <KeysPanel
      isCreateModalOpen={isCreateModalOpen}
      onCreateModalOpenChange={setIsCreateModalOpen}
    />
  );
}
