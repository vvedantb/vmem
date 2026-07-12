import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { IconCheck, IconCpu, IconDownload } from "@tabler/icons-react-native";
import { useColorScheme } from "nativewind";
import BottomSheet from "@/components/ui/BottomSheet";
import { Text } from "@/components/ui/text";
import { THEME_COLORS } from "@/lib/theme";
import {
  MODELS,
  checkModelStatus,
  getActiveModelIdOrDefault,
  setActiveModelId,
  type ModelInfo,
} from "@/services/model-manager";

interface LocalModelSelectorSheetProps {
  disabled?: boolean;
  /** Called after a downloaded model is selected (reload + context length refresh). */
  onModelSelected: () => void;
}

/** Pill trigger + sheet of on-device GGUF models — mobile port of web's local ModelSelector dropdown. */
export default function LocalModelSelectorSheet({
  disabled = false,
  onModelSelected,
}: LocalModelSelectorSheetProps) {
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [downloadedIds, setDownloadedIds] = useState<Set<string>>(new Set());
  const { colorScheme } = useColorScheme();
  const theme = colorScheme === "dark" ? THEME_COLORS.dark : THEME_COLORS.light;

  const refresh = useCallback(async () => {
    const current = await getActiveModelIdOrDefault();
    setActiveId(current);
    const downloaded = new Set<string>();
    for (const model of MODELS) {
      const status = await checkModelStatus(model.id);
      if (status.state === "ready") downloaded.add(model.id);
    }
    setDownloadedIds(downloaded);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  const activeModel = MODELS.find((model) => model.id === activeId);
  const label = activeModel?.name ?? "Select model";

  const handleSelect = async (model: ModelInfo) => {
    if (!downloadedIds.has(model.id)) {
      setOpen(false);
      router.push("/settings/models");
      return;
    }
    await setActiveModelId(model.id);
    setActiveId(model.id);
    setOpen(false);
    onModelSelected();
  };

  return (
    <>
      <Pressable
        disabled={disabled}
        onPress={() => setOpen(true)}
        className={`flex-row items-center gap-1 rounded-full bg-default px-2 py-1 ${
          disabled ? "opacity-50" : ""
        }`}
      >
        <IconCpu size={12} strokeWidth={1.5} color={theme.muted} />
        <Text className="text-[11px] text-muted-foreground" numberOfLines={1}>
          {label}
        </Text>
      </Pressable>

      <BottomSheet
        visible={open}
        onClose={() => setOpen(false)}
        title="Local model"
      >
        <ScrollView className="px-3 pb-3">
          {MODELS.map((model) => {
            const isDownloaded = downloadedIds.has(model.id);
            const isActive = model.id === activeId;
            return (
              <Pressable
                key={model.id}
                onPress={() => void handleSelect(model)}
                className="flex-row items-center gap-3 rounded-xl px-3 py-3 active:bg-surface-tertiary"
              >
                <View className="flex-1">
                  <Text className="text-sm font-sans-medium text-overlay-foreground">
                    {model.name}
                  </Text>
                  <Text className="mt-0.5 text-xs text-muted-foreground">
                    {model.size} · {model.description}
                  </Text>
                </View>
                {isActive ? (
                  <IconCheck size={16} color={theme.foreground} />
                ) : !isDownloaded ? (
                  <IconDownload size={16} color={theme.muted} />
                ) : null}
              </Pressable>
            );
          })}
          <Pressable
            onPress={() => {
              setOpen(false);
              router.push("/settings/models");
            }}
            className="mt-1 px-3 py-2"
          >
            <Text className="text-xs text-muted-foreground underline">
              Manage models in Settings
            </Text>
          </Pressable>
        </ScrollView>
      </BottomSheet>
    </>
  );
}
