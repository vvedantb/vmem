import { useState, useEffect, useCallback } from "react";
import { Alert, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  MODELS,
  checkModelStatus,
  startModelDownload,
  deleteModel,
  getActiveModelId,
  setActiveModelId,
  type ModelState,
} from "@/services/model-manager";
import { unloadLocalModel } from "@/services/llm-context";
import { useIsOnline } from "@/providers/NetworkProvider";
import ModelCard from "@/components/settings/models/ModelCard";
import SettingsHeader from "@/components/settings/SettingsHeader";
import { Text } from "@/components/ui/text";

export default function ModelsScreen() {
  const [states, setStates] = useState<Record<string, ModelState>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const isOnline = useIsOnline();

  useEffect(() => {
    void (async () => {
      setActiveId(await getActiveModelId());

      const nextStates: Record<string, ModelState> = {};
      await Promise.all(
        MODELS.map(async (model) => {
          nextStates[model.id] = await checkModelStatus(model.id);
        }),
      );
      setStates(nextStates);
    })();
  }, []);

  const handleDownload = useCallback(
    async (modelId: string) => {
      if (!isOnline) {
        Alert.alert(
          "No Internet",
          "Connect to the internet to download the AI model.",
        );
        return;
      }

      setStates((prev) => ({
        ...prev,
        [modelId]: { state: "downloading", progress: 0 },
      }));

      try {
        const path = await startModelDownload(modelId, (progress) => {
          setStates((prev) => ({
            ...prev,
            [modelId]: { state: "downloading", progress },
          }));
        });
        setStates((prev) => ({
          ...prev,
          [modelId]: { state: "ready", path },
        }));

        if (!activeId) {
          await setActiveModelId(modelId);
          setActiveId(modelId);
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : "Download failed";
        setStates((prev) => ({
          ...prev,
          [modelId]: { state: "error", message },
        }));
      }
    },
    [isOnline, activeId],
  );

  const handleDelete = useCallback(
    (modelId: string) => {
      const model = MODELS.find((m) => m.id === modelId);
      Alert.alert(
        "Delete Model",
        `Delete ${model?.name ?? "model"}? You'll need to re-download it.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              try {
                if (activeId === modelId) {
                  await unloadLocalModel();
                }
                await deleteModel(modelId);
                setStates((prev) => ({
                  ...prev,
                  [modelId]: { state: "not_downloaded" },
                }));
                if (activeId === modelId) {
                  setActiveId(null);
                }
              } catch (e) {
                const message =
                  e instanceof Error ? e.message : "Delete failed";
                Alert.alert("Error", message);
              }
            },
          },
        ],
      );
    },
    [activeId],
  );

  const handleSelect = useCallback(async (modelId: string) => {
    await unloadLocalModel();
    await setActiveModelId(modelId);
    setActiveId(modelId);
  }, []);

  return (
    <SafeAreaView className="flex-1 bg-surface">
      <SettingsHeader title="Models" variant="back" />

      <ScrollView
        className="flex-1 px-6"
        contentContainerStyle={{ paddingBottom: 32 }}
      >
        <Text className="text-sm font-sans-medium uppercase tracking-wider text-muted-foreground">
          Offline AI Models
        </Text>
        <Text className="-mt-1 mb-1 text-xs text-muted-foreground">
          Download models to chat offline. Tap a downloaded model to make it
          active.
        </Text>

        {MODELS.map((model) => (
          <ModelCard
            key={model.id}
            model={model}
            modelState={states[model.id] ?? { state: "not_downloaded" }}
            isActive={activeId === model.id}
            onDownload={() => handleDownload(model.id)}
            onDelete={() => handleDelete(model.id)}
            onSelect={() => handleSelect(model.id)}
          />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
