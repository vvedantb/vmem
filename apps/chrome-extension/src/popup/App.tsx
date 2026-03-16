import { useState, useEffect } from "react";
import {
  IconDeviceFloppy,
  IconDownload,
  IconSettings,
} from "@tabler/icons-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@vmem/ui";
import { SettingsForm } from "./_components/SettingsForm";
import { QuickSave } from "./_components/QuickSave";
import { ImportPanel } from "./_components/ImportPanel";
import type { ContentMessage, BackgroundResponse } from "@/types/messages";

export function App() {
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

      <Tabs defaultValue="save" className="flex flex-1 flex-col">
        <TabsList className="mx-3 mt-3 w-auto">
          <TabsTrigger value="save" className="flex-1 gap-1.5">
            <IconDeviceFloppy size={16} stroke={1.8} />
            Save
          </TabsTrigger>
          <TabsTrigger value="import" className="flex-1 gap-1.5">
            <IconDownload size={16} stroke={1.8} />
            Import
          </TabsTrigger>
          <TabsTrigger value="settings" className="flex-1 gap-1.5">
            <IconSettings size={16} stroke={1.8} />
            Settings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="save" className="flex-1 p-5">
          <QuickSave />
        </TabsContent>
        <TabsContent value="import" className="flex-1 p-5">
          <ImportPanel />
        </TabsContent>
        <TabsContent value="settings" className="flex-1 p-5">
          <SettingsForm onConnectionChange={setConnected} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
