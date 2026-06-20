import { useState } from "react";
import {
  Button,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@vmem/ui";
import {
  IconCopy,
  IconCheck,
  IconPlayerStop,
  IconUsers,
} from "@tabler/icons-react";
import { toast } from "sonner";
import type { PresentationSync } from "../usePresentationSync";

interface PresentationHostBarProps {
  sync: PresentationSync;
  /** Bubbled to the controls overlay so it stays revealed while open. */
  onOpenChange: (open: boolean) => void;
}

/**
 * The presenter's control: a "Live · N watching" pill that opens a popover
 * with the share link (copy), the live viewer list, and Stop sharing.
 */
export function PresentationHostBar({
  sync,
  onOpenChange,
}: PresentationHostBarProps) {
  const [copied, setCopied] = useState(false);

  const copyLink = async () => {
    if (!sync.shareUrl) return;
    try {
      await navigator.clipboard.writeText(sync.shareUrl);
      setCopied(true);
      toast.success("Share link copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy the link");
    }
  };

  return (
    <Popover onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-full bg-surface-secondary/90 px-3.5 py-2 text-sm font-medium text-foreground shadow-lg backdrop-blur transition-[background-color] hover:bg-surface-tertiary"
        >
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500/70" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
          </span>
          Live
          <span className="text-muted">·</span>
          <IconUsers size={14} className="text-muted" />
          <span className="tabular-nums">{sync.viewerCount}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-3">
        <div className="space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">
            Share link
          </p>
          <div className="flex gap-2">
            <Input
              readOnly
              value={sync.shareUrl ?? ""}
              className="h-9 font-mono text-xs"
              onFocus={(e) => e.currentTarget.select()}
            />
            <Button
              size="icon-sm"
              variant="secondary"
              onClick={() => void copyLink()}
              title={copied ? "Copied" : "Copy link"}
            >
              {copied ? <IconCheck size={15} /> : <IconCopy size={15} />}
            </Button>
          </div>
        </div>

        <div className="space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">
            Watching ({sync.viewerCount})
          </p>
          {sync.viewers.length === 0 ? (
            <p className="text-sm text-muted">
              No one yet. Share the link to invite viewers.
            </p>
          ) : (
            <ul className="max-h-40 space-y-1 overflow-y-auto">
              {sync.viewers.map((viewer) => (
                <li
                  key={viewer.participantKey}
                  className="truncate text-sm text-foreground"
                >
                  {viewer.name}
                </li>
              ))}
            </ul>
          )}
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-center text-danger hover:text-danger"
          onClick={() => void sync.stopSharing()}
        >
          <IconPlayerStop size={15} /> Stop sharing
        </Button>
      </PopoverContent>
    </Popover>
  );
}
