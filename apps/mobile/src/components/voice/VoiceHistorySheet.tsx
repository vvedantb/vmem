import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import {
  IconChevronDown,
  IconChevronUp,
  IconMessageCircle,
} from "@tabler/icons-react-native";
import { useColorScheme } from "nativewind";
import type { UIMessage } from "@convex-dev/agent/react";
import MessageBubble from "@/components/chat/MessageBubble";
import { Text } from "@/components/ui/text";
import { THEME_COLORS } from "@/lib/theme";
import type { ChatMemoryRef } from "@/hooks/useChatProvider";

interface VoiceHistorySheetProps {
  messages: UIMessage[];
  memoryRefsByMessageKey: Record<string, ChatMemoryRef[]>;
}

/** Collapsible conversation history — port of web VoiceHistoryDrawer. */
export default function VoiceHistorySheet({
  messages,
  memoryRefsByMessageKey,
}: VoiceHistorySheetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const { colorScheme } = useColorScheme();
  const theme = colorScheme === "dark" ? THEME_COLORS.dark : THEME_COLORS.light;

  useEffect(() => {
    if (isOpen) {
      scrollRef.current?.scrollToEnd({ animated: false });
    }
  }, [isOpen, messages.length]);

  if (messages.length === 0) return null;

  return (
    <View className="relative w-full">
      {isOpen && (
        <View
          className="absolute bottom-full left-0 right-0 mb-2 overflow-hidden rounded-lg bg-surface-secondary/40"
          style={{ maxHeight: 288 }}
        >
          <ScrollView ref={scrollRef} className="p-4">
            <Text className="mb-3 text-xs font-sans-medium uppercase tracking-wider text-muted-foreground">
              Conversation
            </Text>
            {messages.map((message) => (
              <MessageBubble
                key={message.key}
                message={message}
                memoryRefs={memoryRefsByMessageKey[message.key]}
              />
            ))}
          </ScrollView>
        </View>
      )}

      <Pressable
        onPress={() => setIsOpen((prev) => !prev)}
        className="mx-auto flex-row items-center gap-2 rounded-full px-4 py-2 active:bg-surface-tertiary/50"
        accessibilityLabel={isOpen ? "Hide conversation" : "Show conversation"}
      >
        <IconMessageCircle size={14} color={theme.muted} strokeWidth={1.5} />
        <Text className="text-xs font-sans-medium text-muted-foreground">
          {isOpen ? "Hide" : "Show"} conversation ({messages.length})
        </Text>
        {isOpen ? (
          <IconChevronDown size={14} color={theme.muted} strokeWidth={1.5} />
        ) : (
          <IconChevronUp size={14} color={theme.muted} strokeWidth={1.5} />
        )}
      </Pressable>
    </View>
  );
}
