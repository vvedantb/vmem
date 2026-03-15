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
    <div className="bg-zinc-950 text-zinc-100 min-h-[500px] flex flex-col">
      <header className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <span className="text-lg font-semibold">vmem</span>
          <span
            className={`w-2 h-2 rounded-full ${
              connected === null
                ? "bg-zinc-600"
                : connected
                  ? "bg-emerald-500"
                  : "bg-red-500"
            }`}
          />
        </div>
      </header>

      <nav className="flex border-b border-zinc-800">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "text-indigo-400 border-b-2 border-indigo-400"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <main className="flex-1 p-4">
        {activeTab === "save" && <QuickSave />}
        {activeTab === "import" && <ImportPanel />}
        {activeTab === "settings" && (
          <SettingsForm onConnectionChange={setConnected} />
        )}
      </main>
    </div>
  );
}
