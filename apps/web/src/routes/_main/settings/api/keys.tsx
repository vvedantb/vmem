import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@vmem/ui";
import { IconPlus } from "@tabler/icons-react";
import PageContainer from "@/components/PageContainer";
import { ApiTabs } from "./-components/ApiTabs";
import { KeysPanel } from "./-components/KeysPanel";

export const Route = createFileRoute("/_main/settings/api/keys")({
  component: KeysRoute,
});

/**
 * `/settings/api/keys` — manage API credentials third parties use to call
 * vmem. Self-contained subroute. Owns the create-key modal state so the
 * page-header "New Key" button and the empty-state CTA can both open it.
 */
function KeysRoute() {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  return (
    <PageContainer
      title="API"
      showTitle={false}
      centeredMaxWidth
      leftSection={<ApiTabs />}
      rightSection={
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsCreateModalOpen(true)}
        >
          <IconPlus size={16} />
          New Key
        </Button>
      }
    >
      <KeysPanel
        isCreateModalOpen={isCreateModalOpen}
        onCreateModalOpenChange={setIsCreateModalOpen}
      />
    </PageContainer>
  );
}
