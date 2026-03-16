import { useState, useEffect } from "react";
import { SettingsForm } from "./_components/SettingsForm";
import { QuickSave } from "./_components/QuickSave";
import { ImportPanel } from "./_components/ImportPanel";
import type { ContentMessage, BackgroundResponse } from "@/types/messages";

type Tab = "save" | "import" | "settings";

export function App() {
  const [activeTab, setActiveTab] = useState<Tab>("save");
  const [connected, setConnected] = useState<boolean | null>(null);

  useEffect(() => {
    const message: ContentMessage = { type: "TEST_CONNECTION" };
    chrome.runtime.sendMessage(
      message,
      (response: BackgroundResponse | undefined) => {
        if (response?.type === "CONNECTION_RESULT") {
          setConnected(response.connected);
        }
      },
    );
  }, []);

  const tabs: { key: Tab; label: string }[] = [
    { key: "save", label: "Save" },
    { key: "import", label: "Import" },
    { key: "settings", label: "Settings" },
  ];

  return (
    <div className="bg-background text-foreground min-h-[500px] flex flex-col">
      <header className="flex items-center justify-between px-5 py-4 border-b border-border/50">
        <div className="flex items-center gap-2.5">
          <span className="text-lg font-serif tracking-tight">
            v<span className="italic">mem</span>
          </span>
          <span
            className={`w-2 h-2 rounded-full ${
              connected === null
                ? "bg-muted-foreground/40"
                : connected
                  ? "bg-success"
                  : "bg-destructive"
            }`}
          />
        </div>
      </header>

      <nav className="flex gap-1 px-3 pt-2">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 py-2 text-sm font-medium rounded-lg ${
              activeTab === tab.key
                ? "glass-interactive text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <main className="flex-1 p-5">
        {activeTab === "save" && <QuickSave />}
        {activeTab === "import" && <ImportPanel />}
        {activeTab === "settings" && (
          <SettingsForm onConnectionChange={setConnected} />
        )}
      </main>
    </div>
  );
}
