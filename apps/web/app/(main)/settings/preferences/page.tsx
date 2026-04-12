"use client";

import { IconCpu } from "@tabler/icons-react";
import PageContainer from "@/components/PageContainer";
import LocalModelsSection from "./_components/LocalModelsSection";

export default function PreferencesPage() {
  return (
    <PageContainer title="Preferences">
      {/* Local AI Models */}
      <div className="rounded-xl border border-border p-6">
        <div className="flex items-center gap-2 mb-4">
          <IconCpu className="h-5 w-5 text-muted-foreground" />
          <h3 className="text-base font-medium text-foreground">
            Local AI Models
          </h3>
        </div>
        <p className="text-sm text-muted-foreground mb-5">
          Download and run AI models locally in your browser. Use the toggle in
          chat to switch between cloud and local models.
        </p>
        <LocalModelsSection />
      </div>
    </PageContainer>
  );
}
