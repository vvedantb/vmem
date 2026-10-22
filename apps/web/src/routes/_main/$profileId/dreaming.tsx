import { createFileRoute } from "@tanstack/react-router";
import { useQueryStates } from "nuqs";
import { Badge, Tabs, TabsList, TabsTrigger } from "@vvedantb/ui";
import { IconChecklist, IconHistory } from "@tabler/icons-react";
import PageContainer from "@/components/shell/PageContainer";
import { DreamCleanupCard } from "@/components/dreaming/DreamCleanupCard";
import {
  DreamingActions,
  DreamingPanel,
} from "@/components/dreaming/DreamingPanel";
import { ProposalsPanel } from "@/components/proposals/ProposalsPanel";
import { useProposals } from "@/hooks/useProposals";
import { dreamingSearchParams } from "@/lib/url-state/dreaming";

// `/dreaming`: Proposals (default) and History tabs. The cleanup card sits
// above both tabs so a scan started from the header shows on either tab.
export const Route = createFileRoute("/_main/$profileId/dreaming")({
  component: DreamingRoute,
});

function DreamingRoute() {
  const [{ tab }, setParams] = useQueryStates(dreamingSearchParams);
  const { pendingCount } = useProposals();

  return (
    <PageContainer
      title="Dreaming"
      showTitle
      centeredMaxWidth
      insetHeader
      rightSection={<DreamingActions />}
      tabs={
        <Tabs
          value={tab}
          onValueChange={(v) => {
            if (v === "proposals" || v === "history")
              void setParams({ tab: v });
          }}
        >
          <TabsList>
            <TabsTrigger value="proposals" className="gap-1.5">
              <IconChecklist size={16} />
              <span>Proposals</span>
              {pendingCount > 0 ? (
                <Badge
                  variant="secondary"
                  className="h-5 px-1.5 text-[11px] tabular-nums"
                >
                  {pendingCount}
                </Badge>
              ) : null}
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-1.5">
              <IconHistory size={16} />
              <span>History</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>
      }
    >
      <div className="flex flex-col gap-4">
        <DreamCleanupCard />
        {tab === "proposals" ? <ProposalsPanel /> : <DreamingPanel />}
      </div>
    </PageContainer>
  );
}
