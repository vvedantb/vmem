import { useState, useEffect } from "react";
import { useQuery } from "convex/react";
import { IconDeviceFloppy } from "@tabler/icons-react";
import { Button, Card, CardContent, Label, Skeleton } from "@vmem/ui";
import { api } from "@vmem/backend";
import { truncate } from "es-toolkit/compat";
import { sendMessage } from "@/lib/messaging";
import { extractPageFromTab } from "@/lib/extract-page";
import { useBrowserDefaultProfile } from "@/popup/useBrowserDefaultProfile";
import { useExtensionUserSettings } from "@/popup/useExtensionUserSettings";
import { ProfileSelect } from "./ProfileSelect";

interface PageInfo {
  title: string;
  url: string;
  favicon: string;
}

function formatTimestamp(): string {
  const now = new Date();
  const timeStr = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(now);
  return `Today at ${timeStr}`;
}

function truncateUrl(url: string, maxLength = 40): string {
  try {
    const parsed = new URL(url);
    const display = parsed.host + parsed.pathname;
    return truncate(display, { length: maxLength, omission: "…" });
  } catch {
    return truncate(url, { length: maxLength });
  }
}

function queryActiveTab(): Promise<chrome.tabs.Tab | undefined> {
  return chrome.tabs
    .query({ active: true, currentWindow: true })
    .then((tabs) => tabs[0]);
}

export function QuickSave() {
  const profiles = useQuery(api.profiles.list);
  const { setExtensionDefaultProfile } = useExtensionUserSettings();
  const { effectiveProfileId } = useBrowserDefaultProfile(profiles);
  const [pageInfo, setPageInfo] = useState<PageInfo | null>(null);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  useEffect(() => {
    void queryActiveTab().then((tab) => {
      if (!tab?.url) return;
      setPageInfo({
        title: tab.title ?? "Untitled",
        url: tab.url,
        favicon: tab.favIconUrl ?? "",
      });
    });
  }, []);

  async function handleSave() {
    setSaving(true);
    setResult(null);

    const tab = await queryActiveTab();
    if (!tab?.id || !tab.url) {
      setSaving(false);
      setResult({ success: false, message: "No active tab found" });
      return;
    }

    const extraction = await extractPageFromTab(tab.id);
    if (!extraction) {
      setSaving(false);
      setResult({ success: false, message: "Failed to extract page" });
      return;
    }

    try {
      await sendMessage("savePage", {
        url: tab.url,
        title:
          extraction.ogTitle ?? extraction.title ?? tab.title ?? "Untitled",
        content: extraction.content,
        markdown: extraction.html,
        ogImage: extraction.ogImage,
        ogDescription: extraction.ogDescription,
        profileId: effectiveProfileId || undefined,
      });
      setResult({ success: true, message: "Page saved to vmem" });
    } catch (err) {
      setResult({
        success: false,
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {pageInfo ? (
        <Card className="shadow-none">
          <CardContent className="space-y-2 p-4">
            <div className="flex items-start gap-2.5">
              {pageInfo.favicon ? (
                <img
                  src={pageInfo.favicon}
                  alt=""
                  className="mt-0.5 h-4 w-4 shrink-0 rounded-sm outline outline-1 outline-white/10"
                />
              ) : (
                <div className="mt-0.5 h-4 w-4 shrink-0 rounded-sm bg-surface-secondary" />
              )}
              <span className="line-clamp-2 text-sm font-medium leading-tight text-balance">
                {pageInfo.title}
              </span>
            </div>
            <p className="truncate text-xs text-muted">
              {truncateUrl(pageInfo.url)}
            </p>
            <p className="text-xs text-muted">{formatTimestamp()}</p>
          </CardContent>
        </Card>
      ) : null}

      {profiles === undefined ? (
        <div className="flex items-center justify-between gap-3">
          <Label className="text-sm font-medium">Save to</Label>
          <Skeleton className="h-9 w-[160px] rounded-field" />
        </div>
      ) : profiles.length > 0 ? (
        <div className="flex items-center justify-between gap-3">
          <Label className="text-sm font-medium">Save to</Label>
          <ProfileSelect
            profiles={profiles}
            value={effectiveProfileId}
            onValueChange={(profileId) => {
              const profile = profiles.find((entry) => entry._id === profileId);
              if (profile) void setExtensionDefaultProfile(profile._id);
            }}
            disabled={saving}
          />
        </div>
      ) : null}

      <Button
        className="w-full"
        onClick={() => void handleSave()}
        disabled={saving || !pageInfo}
      >
        <IconDeviceFloppy size={16} />
        {saving ? "Saving..." : "Save to vmem"}
      </Button>

      {result ? (
        <p
          className={`text-sm ${result.success ? "text-success" : "text-danger"}`}
        >
          {result.message}
        </p>
      ) : null}
    </div>
  );
}
