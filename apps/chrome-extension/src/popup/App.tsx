import { useState, useEffect } from "react";
import {
  IconDeviceFloppy,
  IconDownload,
  IconSettings,
} from "@tabler/icons-react";
import { SettingsForm } from "./_components/SettingsForm";
import { QuickSave } from "./_components/QuickSave";
import { ImportPanel } from "./_components/ImportPanel";
import type { ContentMessage, BackgroundResponse } from "@/types/messages";

type Tab = "save" | "import" | "settings";

const TABS: { key: Tab; label: string; icon: typeof IconDeviceFloppy }[] = [
  { key: "save", label: "Save", icon: IconDeviceFloppy },
  { key: "import", label: "Import", icon: IconDownload },
  { key: "settings", label: "Settings", icon: IconSettings },
];

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

  return (
    <div className="glass-panel text-foreground min-h-[500px] flex flex-col">
      <header className="flex items-center justify-between px-5 py-3.5 border-b border-border/30">
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

      <nav className="flex gap-1 px-3 pt-3">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-medium rounded-xl ${
                activeTab === tab.key
                  ? "glass-interactive text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon size={16} stroke={1.8} />
              {tab.label}
            </button>
          );
        })}
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
