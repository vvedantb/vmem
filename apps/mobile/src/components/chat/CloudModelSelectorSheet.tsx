import { useEffect, useMemo, useState } from "react";
import { Pressable, SectionList, View } from "react-native";
import { useAction } from "convex/react";
import { IconCheck, IconCloud } from "@tabler/icons-react-native";
import { useColorScheme } from "nativewind";
import { api } from "@vmem/backend";
import type { FunctionReturnType } from "convex/server";
import {
  formatOpenRouterProviderLabel,
  groupCloudModelsByProvider,
  providerFromOpenRouterModelId,
} from "@vmem/shared";
import CloudModelProviderIcon from "@/components/chat/CloudModelProviderIcon";
import BottomSheet from "@/components/ui/BottomSheet";
import { Text } from "@/components/ui/text";
import { THEME_COLORS } from "@/lib/theme";

type FreeChatModel = FunctionReturnType<
  typeof api.openRouterModels.listFreeChatModels
>[number];

interface CloudModelSelectorSheetProps {
  modelId: string | null;
  onSelectModel: (modelId: string) => void;
  /** Reports the selected model's context window for the usage meter. */
  onContextLength: (contextLength: number) => void;
  disabled?: boolean;
}

/** Pill trigger + grouped sheet of OpenRouter free models — port of web CloudModelSelector. */
export default function CloudModelSelectorSheet({
  modelId,
  onSelectModel,
  onContextLength,
  disabled = false,
}: CloudModelSelectorSheetProps) {
  const listFreeChatModels = useAction(api.openRouterModels.listFreeChatModels);
  const [open, setOpen] = useState(false);
  const [loadedModels, setLoadedModels] = useState<FreeChatModel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { colorScheme } = useColorScheme();
  const theme = colorScheme === "dark" ? THEME_COLORS.dark : THEME_COLORS.light;

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    void listFreeChatModels()
      .then((result) => {
        if (!cancelled) setLoadedModels(result);
      })
      .catch((error: unknown) => {
        console.error("Failed to load free chat models:", error);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [listFreeChatModels]);

  // Auto-select the first model when none is stored (web parity).
  useEffect(() => {
    if (loadedModels.length === 0) return;
    if (modelId !== null) return;
    onSelectModel(loadedModels[0].id);
  }, [loadedModels, modelId, onSelectModel]);

  const selected =
    loadedModels.find((model) => model.id === modelId) ?? loadedModels[0];

  useEffect(() => {
    if (selected) onContextLength(selected.contextLength);
  }, [selected, onContextLength]);

  const sections = useMemo(
    () =>
      groupCloudModelsByProvider(loadedModels).map(([provider, models]) => ({
        title: formatOpenRouterProviderLabel(provider),
        provider,
        data: models,
      })),
    [loadedModels],
  );

  const label = isLoading ? "Loading…" : (selected?.name ?? "Select model");
  const selectedProvider =
    selected !== undefined ? providerFromOpenRouterModelId(selected.id) : null;

  return (
    <>
      <Pressable
        disabled={disabled || isLoading || loadedModels.length === 0}
        onPress={() => setOpen(true)}
        className={`flex-row items-center gap-1 rounded-full bg-default px-2 py-1 ${
          disabled || isLoading ? "opacity-50" : ""
        }`}
        style={{ maxWidth: 180 }}
      >
        {selectedProvider !== null ? (
          <CloudModelProviderIcon provider={selectedProvider} size={12} />
        ) : (
          <IconCloud size={12} strokeWidth={1.5} color={theme.muted} />
        )}
        <Text className="text-[11px] text-muted-foreground" numberOfLines={1}>
          {label}
        </Text>
      </Pressable>

      <BottomSheet
        visible={open}
        onClose={() => setOpen(false)}
        title="Free cloud model"
      >
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          className="px-3 pb-3"
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => (
            <View className="flex-row items-center gap-1.5 px-3 pb-1 pt-3">
              <CloudModelProviderIcon provider={section.provider} size={14} />
              <Text className="text-[11px] font-sans-semibold uppercase tracking-widest text-muted-foreground">
                {section.title}
              </Text>
            </View>
          )}
          renderItem={({ item }) => {
            const isActive = item.id === (modelId ?? selected?.id);
            return (
              <Pressable
                onPress={() => {
                  onSelectModel(item.id);
                  setOpen(false);
                }}
                className="flex-row items-center gap-3 rounded-xl px-3 py-2.5 active:bg-surface-tertiary"
              >
                <View className="flex-1">
                  <Text className="text-sm text-overlay-foreground">
                    {item.name}
                  </Text>
                </View>
                {isActive ? (
                  <IconCheck size={16} color={theme.foreground} />
                ) : null}
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <Text className="px-3 py-3 text-sm text-muted-foreground">
              {isLoading ? "Loading models…" : "No models available"}
            </Text>
          }
        />
      </BottomSheet>
    </>
  );
}
