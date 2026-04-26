import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryStates } from "nuqs";
import { Button } from "@vmem/ui";
import { IconPlus } from "@tabler/icons-react";
import PageContainer from "@/components/PageContainer";
import { apiSearchParams } from "./-searchParams";
import { ApiTabs } from "./-components/ApiTabs";
import { KeysPanel } from "./-components/KeysPanel";
import { UsagePanel } from "./-components/UsagePanel";

export const Route = createFileRoute("/_main/settings/api/")({
  component: ApiPage,
});

/**
 * `/settings/api` — merged surface for API keys + their usage analytics.
 *
 * The orchestrator owns the `tab` URL param and the create-key modal
 * state (so a "New Key" button can live in the page header on the
 * Keys tab without coupling header markup to panel internals).
 */
function ApiPage() {
  const [params, setParams] = useQueryStates(apiSearchParams);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const rightSection =
    params.tab === "keys" ? (
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsCreateModalOpen(true)}
      >
        <IconPlus size={16} />
        New Key
      </Button>
    ) : null;

  return (
    <PageContainer
      title="API"
      centeredMaxWidth
      leftSection={
        <ApiTabs value={params.tab} onChange={(tab) => setParams({ tab })} />
      }
      rightSection={rightSection}
    >
      {params.tab === "keys" ? (
        <KeysPanel
          isCreateModalOpen={isCreateModalOpen}
          onCreateModalOpenChange={setIsCreateModalOpen}
        />
      ) : (
        <UsagePanel />
      )}
    </PageContainer>
  );
}
