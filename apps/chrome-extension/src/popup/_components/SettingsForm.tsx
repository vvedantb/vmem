import { useState, useEffect } from "react";
import { Button, Input, Label } from "@vmem/ui";
import { getStorage, setStorage } from "@/lib/storage";
import type { ExtensionStorage } from "@/types/storage";
import type { ContentMessage, BackgroundResponse } from "@/types/messages";

interface SettingsFormProps {
  onConnectionChange: (connected: boolean) => void;
}

export function SettingsForm({ onConnectionChange }: SettingsFormProps) {
  const [settings, setSettings] = useState<ExtensionStorage>({
    apiUrl: "http://localhost:3001",
    apiKey: "",
    userId: "",
  });
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  useEffect(() => {
    getStorage().then(setSettings);
  }, []);

  function handleChange(field: keyof ExtensionStorage, value: string) {
    const updated = { ...settings, [field]: value };
    setSettings(updated);
    setStorage({ [field]: value });
  }

  function handleTestConnection() {
    setTesting(true);
    setTestResult(null);

    const message: ContentMessage = { type: "TEST_CONNECTION" };
    chrome.runtime.sendMessage(
      message,
      (response: BackgroundResponse | undefined) => {
        setTesting(false);
        if (response?.type === "CONNECTION_RESULT") {
          onConnectionChange(response.connected);
          setTestResult(
            response.connected
              ? "Connected"
              : `Failed: ${response.error || "Could not reach API"}`,
          );
        }
      },
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>API URL</Label>
        <Input
          type="url"
          value={settings.apiUrl}
          onChange={(e) => handleChange("apiUrl", e.target.value)}
          placeholder="http://localhost:3001"
        />
      </div>

      <div className="space-y-1.5">
        <Label>API Key</Label>
        <Input
          type="password"
          value={settings.apiKey}
          onChange={(e) => handleChange("apiKey", e.target.value)}
          placeholder="vmem_sk_..."
        />
      </div>

      <div className="space-y-1.5">
        <Label>User ID</Label>
        <Input
          type="text"
          value={settings.userId}
          onChange={(e) => handleChange("userId", e.target.value)}
          placeholder="Your user ID from the dashboard"
        />
      </div>

      <Button
        variant="outline"
        className="w-full"
        onClick={handleTestConnection}
        disabled={testing}
      >
        {testing ? "Testing..." : "Test Connection"}
      </Button>

      {testResult && (
        <p
          className={`text-sm ${testResult === "Connected" ? "text-success" : "text-destructive"}`}
        >
          {testResult}
        </p>
      )}
    </div>
  );
}
