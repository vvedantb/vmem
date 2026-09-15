import { Pressable, View } from "react-native";
import {
  IconCircle,
  IconCircleCheck,
  IconDownload,
  IconTrash,
} from "@tabler/icons-react-native";
import { useColorScheme } from "nativewind";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/Button";
import { THEME_COLORS } from "@/lib/theme";
import type { ModelInfo, ModelState } from "@/services/model-manager";

function ProgressBar({ progress }: { progress: number }) {
  return (
    <View className="h-1.5 w-full overflow-hidden rounded-full bg-surface-secondary">
      <View
        className="h-full rounded-full bg-accent"
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

export default function ModelCard({
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
      className={`rounded-xl px-3 py-4 ${
        isActive ? "bg-surface-secondary/60" : ""
      }`}
    >
      <View className="flex-row items-start justify-between">
        <View className="mr-3 flex-1">
          <View className="mb-1 flex-row items-center gap-2">
            <Text className="text-base font-sans-semibold text-foreground">
              {model.name}
            </Text>
          </View>
          <Text className="text-sm text-muted-foreground">
            {model.size} · {model.description}
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
          <Text className="text-right text-xs text-muted-foreground">
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
            <IconDownload size={14} color={theme.primaryForeground} />
            <Text className="text-sm text-primary-foreground">Download</Text>
          </Button>
        )}

        {modelState.state === "error" && (
          <Button size="sm" onPress={onDownload}>
            <Text className="text-sm text-primary-foreground">Retry</Text>
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
            <Text className="text-sm text-destructive">Delete</Text>
          </Button>
        )}
      </View>
    </Pressable>
  );
}
