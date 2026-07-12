"use client";

import { IconCloud, IconCpu } from "@tabler/icons-react";
import { cn } from "@vmem/ui";
import type { ChatProviderMode } from "@/hooks/useChatProvider";

interface ProviderToggleProps {
  provider: ChatProviderMode;
  onChange: (provider: ChatProviderMode) => void;
  disabled?: boolean;
}

export default function ProviderToggle({
  provider,
  onChange,
  disabled = false,
}: ProviderToggleProps) {
  return (
    <div className="inline-flex items-center rounded-full bg-default p-0.5">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange("local")}
        className={cn(
          "relative inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] transition-[transform,background-color,color] active:scale-[0.96] before:absolute before:inset-[-4px] before:content-['']",
          provider === "local"
            ? "bg-surface text-foreground"
            : "text-muted hover:text-foreground",
        )}
      >
        <IconCpu className="size-3" stroke={1.5} />
        Local
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange("cloud")}
        className={cn(
          "relative inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] transition-[transform,background-color,color] active:scale-[0.96] before:absolute before:inset-[-4px] before:content-['']",
          provider === "cloud"
            ? "bg-surface text-foreground"
            : "text-muted hover:text-foreground",
        )}
      >
        <IconCloud className="size-3" stroke={1.5} />
        Cloud
      </button>
    </div>
  );
}
