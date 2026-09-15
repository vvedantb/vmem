import { ActivityIndicator, Modal, Pressable, View } from "react-native";
import { IconAlertTriangle } from "@tabler/icons-react-native";
import { useColorScheme } from "nativewind";
import { Text } from "@/components/ui/text";
import { THEME_COLORS } from "@/lib/theme";

interface ClearChatDialogProps {
  visible: boolean;
  isClearing: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/** Destructive confirm dialog — port of web Chat.tsx's clear-history Dialog. */
export default function ClearChatDialog({
  visible,
  isClearing,
  onCancel,
  onConfirm,
}: ClearChatDialogProps) {
  const { colorScheme } = useColorScheme();
  const theme = colorScheme === "dark" ? THEME_COLORS.dark : THEME_COLORS.light;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (!isClearing) onCancel();
      }}
    >
      <View className="flex-1 items-center justify-center bg-black/50 px-6">
        <View className="w-full max-w-sm rounded-2xl bg-overlay p-5">
          <Text className="text-base font-sans-semibold text-overlay-foreground">
            Clear chat history
          </Text>
          <View className="flex-row items-start gap-3 py-4">
            <View className="h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-destructive/10">
              <IconAlertTriangle size={20} color={theme.destructive} />
            </View>
            <View className="flex-1">
              <Text className="text-sm text-overlay-foreground">
                Are you sure you want to clear this chat?
              </Text>
              <Text className="mt-1 text-sm text-muted-foreground">
                This deletes every message in the thread. This action cannot be
                undone — but you can keep chatting in a fresh thread right
                after.
              </Text>
            </View>
          </View>
          <View className="flex-row justify-end gap-2">
            <Pressable
              onPress={onCancel}
              disabled={isClearing}
              className="rounded-lg px-4 py-2.5 active:bg-surface-tertiary"
            >
              <Text className="text-sm text-muted-foreground">Cancel</Text>
            </Pressable>
            <Pressable
              onPress={onConfirm}
              disabled={isClearing}
              className="flex-row items-center gap-2 rounded-lg bg-destructive px-4 py-2.5 active:opacity-90"
            >
              {isClearing && (
                <ActivityIndicator size="small" color={theme.background} />
              )}
              <Text className="text-sm font-sans-medium text-destructive-foreground">
                {isClearing ? "Clearing..." : "Clear chat"}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
