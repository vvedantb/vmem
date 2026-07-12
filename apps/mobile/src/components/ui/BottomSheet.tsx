import type { ReactNode } from "react";
import { Modal, Pressable, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text } from "@/components/ui/text";

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

/**
 * Slide-up sheet — the mobile stand-in for web dropdowns/popovers/hover cards
 * (floating overlay surface: bg-overlay, backdrop scrim like web --backdrop).
 */
export default function BottomSheet({
  visible,
  onClose,
  title,
  children,
}: BottomSheetProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-end bg-black/50">
        <Pressable className="flex-1" onPress={onClose} />
        <View className="rounded-t-2xl bg-overlay" style={{ maxHeight: "75%" }}>
          <SafeAreaView edges={["bottom"]}>
            <View className="items-center pt-3 pb-1">
              <View className="h-1 w-9 rounded-full bg-surface-tertiary" />
            </View>
            {title ? (
              <Text className="px-5 pb-2 pt-1 text-sm font-sans-semibold text-overlay-foreground">
                {title}
              </Text>
            ) : null}
            {children}
          </SafeAreaView>
        </View>
      </View>
    </Modal>
  );
}
