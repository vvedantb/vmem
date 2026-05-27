"use client";

import { useEffect, useState } from "react";
import { useAction } from "convex/react";
import { IconCloud, IconLoader2 } from "@tabler/icons-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@vmem/ui";
import { api } from "@vmem/backend";

interface FreeChatModel {
  id: string;
  name: string;
  contextLength: number;
  description?: string;
}

interface CloudModelSelectorProps {
  modelId: string | null;
  onSelectModel: (modelId: string) => void;
  disabled?: boolean;
}

export default function CloudModelSelector({
  modelId,
  onSelectModel,
  disabled = false,
}: CloudModelSelectorProps) {
  const listFreeChatModels = useAction(api.openRouterModels.listFreeChatModels);
  const [loadedModels, setLoadedModels] = useState<FreeChatModel[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    void listFreeChatModels()
      .then((result) => {
        if (!cancelled) {
          setLoadedModels(result);
        }
      })
      .catch((error) => {
        console.error("Failed to load free chat models:", error);
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [listFreeChatModels]);

  useEffect(() => {
    if (loadedModels.length === 0) return;
    if (modelId !== null) return;
    onSelectModel(loadedModels[0].id);
  }, [loadedModels, modelId, onSelectModel]);

  const selected =
    loadedModels.find((model) => model.id === modelId) ?? loadedModels[0];
  const label = selected?.name ?? "Select model";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={disabled || isLoading || loadedModels.length === 0}
          className="inline-flex items-center gap-1 rounded-full bg-default px-2 py-0.5 text-[11px] text-muted transition-colors hover:bg-default/78 hover:text-foreground disabled:opacity-50"
        >
          <IconCloud className="size-3" stroke={1.5} />
          {isLoading ? "Loading…" : label}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Free cloud model</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {isLoading ? (
          <div className="flex items-center gap-2 px-2 py-2 text-xs text-muted">
            <IconLoader2 className="size-3.5 animate-spin" />
            Loading models…
          </div>
        ) : (
          <DropdownMenuRadioGroup
            value={modelId ?? selected?.id ?? ""}
            onValueChange={onSelectModel}
          >
            {loadedModels.map((model) => (
              <DropdownMenuRadioItem key={model.id} value={model.id}>
                <div className="flex flex-col gap-0.5">
                  <span>{model.name}</span>
                  <span className="text-[10px] text-muted">
                    {Math.round(model.contextLength / 1024)}k context
                  </span>
                </div>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
