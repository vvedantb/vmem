import { createFileRoute } from "@tanstack/react-router";
import { IconCpu, IconMicrophone } from "@tabler/icons-react";
import PageContainer from "@/components/PageContainer";
import LocalModelsSection from "@/components/settings/LocalModelsSection";
import VoiceModelsSection from "@/components/settings/VoiceModelsSection";

export const Route = createFileRoute("/_main/settings/preferences")({
  component: PreferencesPage,
});

function PreferencesPage() {
  return (
    <PageContainer title="Preferences" centeredMaxWidth showTitle>
      <div className="space-y-12">
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <IconCpu className="h-5 w-5 text-muted-foreground" />
            <h3 className="text-base font-medium text-foreground">
              Local AI Models
            </h3>
          </div>
          <p className="text-sm text-muted-foreground">
            Download and run AI models locally in your browser. Use the toggle
            in chat to switch between cloud and local models.
          </p>
          <LocalModelsSection />
        </section>

        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <IconMicrophone className="h-5 w-5 text-muted-foreground" />
            <h3 className="text-base font-medium text-foreground">
              Local Voice Models
            </h3>
          </div>
          <p className="text-sm text-muted-foreground">
            Download speech recognition and text-to-speech models for the
            browser-local voice experience. Used on the /voice page.
          </p>
          <VoiceModelsSection />
        </section>
      </div>
    </PageContainer>
  );
}
