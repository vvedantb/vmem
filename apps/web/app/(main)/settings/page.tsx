"use client";

import { useState } from "react";
import SettingsToggles from "@/components/SettingsToggles";
import PageContainer from "@/components/PageContainer";
import ExportSection from "@/components/ExportSection";
import { Button } from "@vmem/ui";

const tabs = [
  { id: "preferences", label: "Preferences" },
  { id: "data-controls", label: "Data Controls" },
] as const;

type TabId = (typeof tabs)[number]["id"];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabId>("preferences");

  return (
    <PageContainer title="Settings">
      <div className="flex gap-8">
        <nav className="w-56 shrink-0">
          <div
            role="tablist"
            aria-label="Settings sections"
            className="space-y-1"
          >
            {tabs.map((tab) => (
              <button
                key={tab.id}
                role="tab"
                aria-selected={activeTab === tab.id}
                aria-controls={`tabpanel-${tab.id}`}
                id={`tab-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? "bg-foreground/10 text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-foreground/5"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </nav>

        <div className="flex-1 min-w-0 space-y-8">
          {activeTab === "preferences" && (
            <div
              role="tabpanel"
              id="tabpanel-preferences"
              aria-labelledby="tab-preferences"
              className="space-y-8"
            >
              <div className="p-8 rounded-xl border border-border bg-muted/50">
                <h3 className="text-lg font-medium mb-2 text-foreground">
                  Profile
                </h3>
                <div className="flex items-center gap-6 mt-6">
                  <div className="w-16 h-16 rounded-full bg-muted border border-border flex items-center justify-center">
                    <span className="text-2xl font-medium text-muted-foreground">
                      U
                    </span>
                  </div>
                  <div>
                    <p className="text-lg font-medium text-foreground">User</p>
                    <p className="text-sm text-muted-foreground">
                      user@example.com
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-8 rounded-xl border border-border bg-muted/50">
                <h3 className="text-lg font-medium mb-6 text-foreground">
                  Preferences
                </h3>
                <SettingsToggles />
              </div>
            </div>
          )}

          {activeTab === "data-controls" && (
            <div
              role="tabpanel"
              id="tabpanel-data-controls"
              aria-labelledby="tab-data-controls"
              className="space-y-8"
            >
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
            </div>
          )}
        </div>
      </div>
    </PageContainer>
  );
}
