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
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] transition-[background-color,color]",
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
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] transition-[background-color,color]",
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
