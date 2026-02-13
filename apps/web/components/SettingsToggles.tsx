"use client";

import { useState } from "react";
import { Switch } from "@vmem/ui";

interface ToggleSetting {
  id: string;
  label: string;
  description: string;
  enabled: boolean;
}

const initialSettings: ToggleSetting[] = [
  {
    id: "semantic-search",
    label: "Semantic Search",
    description: "Use AI-powered semantic search for finding memories",
    enabled: true,
  },
  {
    id: "auto-tagging",
    label: "Auto-Tagging",
    description: "Automatically suggest tags based on memory content",
    enabled: true,
  },
  {
    id: "notifications",
    label: "Notifications",
    description: "Receive notifications for memory-related events",
    enabled: false,
  },
  {
    id: "analytics",
    label: "Usage Analytics",
    description: "Help improve vMemory by sharing anonymous usage data",
    enabled: false,
  },
];

export default function SettingsToggles() {
  const [settings, setSettings] = useState<ToggleSetting[]>(initialSettings);

  const toggleSetting = (id: string) => {
    setSettings(
      settings.map((setting) =>
        setting.id === id ? { ...setting, enabled: !setting.enabled } : setting,
      ),
    );
  };

  return (
    <div className="space-y-6">
      {settings.map((setting) => (
        <div
          key={setting.id}
          className="flex items-center justify-between py-4 border-b border-black/5 dark:border-white/5 last:border-0"
        >
          <div>
            <p className="font-medium text-neutral-800 dark:text-neutral-200">
              {setting.label}
            </p>
            <p className="text-sm text-neutral-500 mt-1">
              {setting.description}
            </p>
          </div>
          <Switch
            checked={setting.enabled}
            onCheckedChange={() => toggleSetting(setting.id)}
          />
        </div>
      ))}
    </div>
  );
}
