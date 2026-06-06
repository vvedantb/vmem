import { createFileRoute } from "@tanstack/react-router";
import { IconFileExport } from "@tabler/icons-react";
import { Card, CardContent } from "@vmem/ui";

export const Route = createFileRoute("/_main/settings/data-controls/export")({
  component: ExportRoute,
});

function ExportRoute() {
  return (
    <Card className="shadow-none">
      <CardContent className="flex min-h-[320px] flex-col items-center justify-center gap-3 px-6 py-16 text-center">
        <IconFileExport size={28} className="text-muted" stroke={1.5} />
        <h3 className="text-base font-medium text-foreground">
          Export coming soon
        </h3>
        <p className="max-w-sm text-sm text-muted">
          You&apos;ll be able to download your memories, tags, and relationships
          as a single archive from here.
        </p>
      </CardContent>
    </Card>
  );
}
