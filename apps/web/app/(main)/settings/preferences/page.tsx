"use client";

import SettingsToggles from "@/components/SettingsToggles";
import PageContainer from "@/components/PageContainer";

export default function PreferencesPage() {
  return (
    <PageContainer title="Preferences">
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
    </PageContainer>
  );
}
