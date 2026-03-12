"use client";

import ExportSection from "@/components/ExportSection";
import PageContainer from "@/components/PageContainer";
import { Button } from "@vmem/ui";

export default function DataControlsPage() {
  return (
    <PageContainer title="Data Controls">
      <ExportSection />

      <div className="p-8 rounded-xl border border-destructive/30 bg-destructive/10">
        <h3 className="text-lg font-medium text-destructive mb-2">
          Danger Zone
        </h3>
        <p className="text-sm text-muted-foreground">
          Permanently delete your account and all associated data.
        </p>
        <Button
          variant="outline"
          className="mt-6 px-5 py-2.5 h-auto rounded-xl border-destructive/30 text-destructive text-sm font-medium hover:bg-destructive/10 hover:text-destructive transition-colors"
        >
          Delete Account
        </Button>
      </div>
    </PageContainer>
  );
}
