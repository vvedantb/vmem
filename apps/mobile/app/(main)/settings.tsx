import { useState, useEffect, useCallback } from "react";
import { View, Alert, ScrollView, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  MODELS,
  checkModelStatus,
  startModelDownload,
  deleteModel,
  getActiveModelId,
  setActiveModelId,
  type ModelInfo,
  type ModelState,
} from "@/services/model-manager";
import { unloadLocalModel } from "@/services/llm-context";
import { useIsOnline } from "@/providers/NetworkProvider";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/badge";
import {
  IconCircleCheck,
  IconCircle,
  IconDownload,
  IconTrash,
} from "@tabler/icons-react-native";
import { useColorScheme } from "nativewind";
import { THEME_COLORS } from "@/lib/theme";

function ProgressBar({ progress }: { progress: number }) {
  return (
    <View className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
      <View
        className="h-full bg-primary rounded-full"
        style={{ width: `${Math.min(progress, 100)}%` }}
      />
    </View>
  );
}

interface ModelCardProps {
  model: ModelInfo;
  modelState: ModelState;
  isActive: boolean;
  onDownload: () => void;
  onDelete: () => void;
  onSelect: () => void;
}

function ModelCard({
  model,
  modelState,
  isActive,
  onDownload,
  onDelete,
  onSelect,
}: ModelCardProps) {
  const { colorScheme } = useColorScheme();
  const theme = colorScheme === "dark" ? THEME_COLORS.dark : THEME_COLORS.light;
  const isReady = modelState.state === "ready";
  const isDownloading = modelState.state === "downloading";

  return (
    <Pressable
      onPress={isReady ? onSelect : undefined}
      className={`rounded-xl border p-4 ${
        isActive ? "border-primary bg-primary/5" : "border-border"
      }`}
    >
      <View className="flex-row items-start justify-between">
        <View className="flex-1 mr-3">
          <View className="flex-row items-center gap-2 mb-1">
            <Text className="text-base font-sans-semibold text-foreground">
              {model.name}
            </Text>
            <Badge variant="secondary">
              <Text className="text-xs">{model.size}</Text>
            </Badge>
          </View>
          <Text className="text-sm text-muted-foreground">
            {model.description}
          </Text>
        </View>

        {isReady ? (
          isActive ? (
            <IconCircleCheck size={22} color={theme.primary} />
          ) : (
            <IconCircle size={22} color={theme.muted} />
          )
        ) : null}
      </View>

      {isDownloading && (
        <View className="mt-3 gap-1">
          <ProgressBar progress={modelState.progress} />
          <Text className="text-xs text-muted-foreground text-right">
            {Math.round(modelState.progress)}%
          </Text>
        </View>
      )}

      {modelState.state === "error" && (
        <Text className="mt-2 text-xs text-destructive">
          {modelState.message}
        </Text>
      )}

      <View className="mt-3 flex-row gap-2">
        {modelState.state === "not_downloaded" && (
          <Button size="sm" onPress={onDownload} className="flex-row gap-1.5">
            <IconDownload size={14} color="#fff" />
            <Text className="text-primary-foreground text-sm">Download</Text>
          </Button>
        )}

        {modelState.state === "error" && (
          <Button size="sm" onPress={onDownload}>
            <Text className="text-primary-foreground text-sm">Retry</Text>
          </Button>
        )}

        {isReady && (
          <Button
            size="sm"
            variant="outline"
            onPress={onDelete}
            className="flex-row gap-1.5"
          >
            <IconTrash size={14} color={theme.destructive} />
            <Text className="text-destructive text-sm">Delete</Text>
          </Button>
        )}
      </View>
    </Pressable>
  );
}

export default function SettingsScreen() {
  const [states, setStates] = useState<Record<string, ModelState>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const isOnline = useIsOnline();
  const { colorScheme } = useColorScheme();
  const theme = colorScheme === "dark" ? THEME_COLORS.dark : THEME_COLORS.light;

  useEffect(() => {
    getActiveModelId().then(setActiveId);

    MODELS.forEach((model) => {
      checkModelStatus(model.id).then((status) => {
        setStates((prev) => ({ ...prev, [model.id]: status }));
      });
    });
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
    <SafeAreaView className="flex-1 bg-background">
      <View className="px-6 pt-6 pb-4">
        <Text className="text-2xl font-sans-bold text-foreground">
          Settings
        </Text>
      </View>

      <ScrollView
        className="flex-1 px-6"
        contentContainerStyle={{ gap: 12, paddingBottom: 32 }}
      >
        <Text className="text-sm font-sans-medium text-muted-foreground uppercase tracking-wider">
          Offline AI Models
        </Text>
        <Text className="text-xs text-muted-foreground -mt-1 mb-1">
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
