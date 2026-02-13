import SettingsToggles from "@/components/SettingsToggles";
import PageContainer from "@/components/PageContainer";
import ExportSection from "@/components/ExportSection";
import { Button } from "@vmem/ui";

export default function SettingsPage() {
  return (
    <PageContainer
      title="Settings"
      description="Configure your vMemory experience"
    >
      <div className="p-8 rounded-xl border border-border bg-muted/50">
        <h3 className="text-lg font-medium mb-2 text-foreground">Profile</h3>
        <div className="flex items-center gap-6 mt-6">
          <div className="w-16 h-16 rounded-full bg-muted border border-border flex items-center justify-center">
            <span className="text-2xl font-medium text-muted-foreground">
              U
            </span>
          </div>
          <div>
            <p className="text-lg font-medium text-foreground">User</p>
            <p className="text-sm text-muted-foreground">user@example.com</p>
          </div>
        </div>
      </div>

      <div className="p-8 rounded-xl border border-border bg-muted/50">
        <h3 className="text-lg font-medium mb-6 text-foreground">
          Preferences
        </h3>
        <SettingsToggles />
      </div>

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
