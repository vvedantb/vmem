"use client";

import { useEffect, useMemo, useState } from "react";
import { useAction } from "convex/react";
import { IconCloud, IconLoader2 } from "@tabler/icons-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@vmem/ui";
import { api } from "@vmem/backend";
import CloudModelProviderIcon from "@/components/CloudModelProviderIcon";
import {
  formatOpenRouterProviderLabel,
  groupCloudModelsByProvider,
  providerFromOpenRouterModelId,
} from "../_utils/cloudModelGroups";

interface FreeChatModel {
  id: string;
  name: string;
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

  const providerGroups = useMemo(
    () => groupCloudModelsByProvider(loadedModels),
    [loadedModels],
  );

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
  const selectedProvider =
    selected !== undefined ? providerFromOpenRouterModelId(selected.id) : null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={disabled || isLoading || loadedModels.length === 0}
          className="inline-flex items-center gap-1 rounded-full bg-default px-2 py-0.5 text-[11px] text-muted transition-colors hover:bg-default/78 hover:text-foreground disabled:opacity-50"
        >
          {selectedProvider !== null ? (
            <CloudModelProviderIcon provider={selectedProvider} size={12} />
          ) : (
            <IconCloud className="size-3" stroke={1.5} />
          )}
          {isLoading ? "Loading…" : label}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        <DropdownMenuLabel>Free cloud model</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {isLoading ? (
          <div className="flex items-center gap-2 px-2 py-2 text-xs text-muted">
            <IconLoader2 className="size-3.5 animate-spin" />
            Loading models…
          </div>
        ) : (
          providerGroups.map(([provider, models]) => (
            <DropdownMenuSub key={provider}>
              <DropdownMenuSubTrigger className="gap-2">
                <CloudModelProviderIcon provider={provider} size={14} />
                {formatOpenRouterProviderLabel(provider)}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup
                  value={modelId ?? selected?.id ?? ""}
                  onValueChange={onSelectModel}
                >
                  {models.map((model) => (
                    <DropdownMenuRadioItem
                      key={model.id}
                      value={model.id}
                      className="gap-2"
                    >
                      <CloudModelProviderIcon provider={provider} size={14} />
                      {model.name}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
