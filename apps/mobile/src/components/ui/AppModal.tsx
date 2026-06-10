import type { ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  View,
} from "react-native";
import { Text } from "@/components/ui/text";

interface AppModalProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
}

/** Centered dialog card — the mobile stand-in for web's Dialog (bg-overlay on a scrim). */
export default function AppModal({
  visible,
  onClose,
  title,
  description,
  children,
}: AppModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        <View className="flex-1 items-center justify-center bg-black/50 px-6">
          <Pressable
            className="absolute inset-0"
            onPress={onClose}
            accessibilityLabel="Close dialog"
          />
          <View className="w-full max-w-sm rounded-2xl bg-overlay p-5">
            <Text className="text-base font-sans-semibold text-overlay-foreground">
              {title}
            </Text>
            {description ? (
              <Text className="mt-1 text-sm text-muted-foreground">
                {description}
              </Text>
            ) : null}
            {children}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
