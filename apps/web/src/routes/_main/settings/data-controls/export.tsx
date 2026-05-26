import { createFileRoute } from "@tanstack/react-router";
import { IconFileExport } from "@tabler/icons-react";
import PageContainer from "@/components/PageContainer";
import { DataControlsTabs } from "./-components/DataControlsTabs";

export const Route = createFileRoute("/_main/settings/data-controls/export")({
  component: ExportRoute,
});

/**
 * `/settings/data-controls/export` — placeholder. The export pipeline
 * isn't wired up yet; this route exists so the tab bar lights up the
 * right segment and so a future implementation has a home to land in.
 */
function ExportRoute() {
  return (
    <PageContainer
      title="Data Controls"
      showTitle={false}
      centeredMaxWidth
      leftSection={<DataControlsTabs />}
    >
      <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 rounded-xl bg-surface-secondary/40 px-6 py-16 text-center">
        <IconFileExport size={28} className="text-muted" stroke={1.5} />
        <h3 className="text-base font-medium text-foreground">
          Export coming soon
        </h3>
        <p className="max-w-sm text-sm text-muted">
          You&apos;ll be able to download your memories, tags, and relationships
          as a single archive from here.
        </p>
      </div>
    </PageContainer>
  );
}
