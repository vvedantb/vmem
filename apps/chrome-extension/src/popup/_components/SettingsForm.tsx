import { useState, useEffect } from "react";
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

  const inputClass =
    "w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-indigo-500";
  const labelClass = "block text-sm font-medium text-zinc-400 mb-1";

  return (
    <div className="space-y-4">
      <div>
        <label className={labelClass}>API URL</label>
        <input
          type="url"
          className={inputClass}
          value={settings.apiUrl}
          onChange={(e) => handleChange("apiUrl", e.target.value)}
          placeholder="http://localhost:3001"
        />
      </div>

      <div>
        <label className={labelClass}>API Key</label>
        <input
          type="password"
          className={inputClass}
          value={settings.apiKey}
          onChange={(e) => handleChange("apiKey", e.target.value)}
          placeholder="vmem_sk_..."
        />
      </div>

      <div>
        <label className={labelClass}>User ID</label>
        <input
          type="text"
          className={inputClass}
          value={settings.userId}
          onChange={(e) => handleChange("userId", e.target.value)}
          placeholder="Your user ID from the dashboard"
        />
      </div>

      <button
        onClick={handleTestConnection}
        disabled={testing}
        className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg py-2 text-sm font-medium transition-colors"
      >
        {testing ? "Testing..." : "Test Connection"}
      </button>

      {testResult && (
        <p
          className={`text-sm ${testResult === "Connected" ? "text-emerald-400" : "text-red-400"}`}
        >
          {testResult}
        </p>
      )}
    </div>
  );
}
