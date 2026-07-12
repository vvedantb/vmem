import { useCallback, useEffect, useRef, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation, DrawerActions } from "expo-router/react-navigation";
import { useColorScheme } from "nativewind";
import { useQuery } from "convex/react";
import { IconMenu2, IconTrash } from "@tabler/icons-react-native";
import type { UIMessage } from "@convex-dev/agent/react";
import { api } from "@vmem/backend";
import ChatEmptyState, {
  type ChatEmptyVariant,
} from "@/components/chat/ChatEmptyState";
import ChatInputBar from "@/components/chat/ChatInputBar";
import ClearChatDialog from "@/components/chat/ClearChatDialog";
import CloudModelSelectorSheet from "@/components/chat/CloudModelSelectorSheet";
import LocalModelSelectorSheet from "@/components/chat/LocalModelSelectorSheet";
import MessageBubble from "@/components/chat/MessageBubble";
import ProviderToggle from "@/components/chat/ProviderToggle";
import { Text } from "@/components/ui/text";
import { useChatProvider } from "@/hooks/useChatProvider";
import { useIsOnline } from "@/providers/NetworkProvider";
import { THEME_COLORS } from "@/lib/theme";
import { MODELS, getActiveModelIdOrDefault } from "@/services/model-manager";

/** Fallback context lengths (web parity: 4096 local fallback, 131072 cloud). */
const DEFAULT_LOCAL_CONTEXT = 4096;
const DEFAULT_CLOUD_CONTEXT = 131072;

export default function ChatScreen() {
  const [inputText, setInputText] = useState("");
  const [clearOpen, setClearOpen] = useState(false);
  const [localContextLength, setLocalContextLength] = useState(
    DEFAULT_LOCAL_CONTEXT,
  );
  const [cloudContextLength, setCloudContextLength] = useState(
    DEFAULT_CLOUD_CONTEXT,
  );
  const flatListRef = useRef<FlatList<UIMessage>>(null);
  const navigation = useNavigation();
  const isOnline = useIsOnline();
  const { colorScheme } = useColorScheme();
  const theme = colorScheme === "dark" ? THEME_COLORS.dark : THEME_COLORS.light;

  const {
    provider,
    activeProvider,
    setProvider,
    messages,
    sendMessage,
    clearHistory,
    isStreaming,
    isClearing,
    mode,
    usageByMessageKey,
    memoryRefsByMessageKey,
    hasOpenRouterKey,
    cloudModelId,
    setCloudModelId,
    refreshLocalModel,
  } = useChatProvider();
  const skills = useQuery(api.skills.listMy, isOnline ? {} : "skip");

  const refreshLocalContextLength = useCallback(async () => {
    const activeId = await getActiveModelIdOrDefault();
    const info = MODELS.find((model) => model.id === activeId);
    setLocalContextLength(info?.contextLength ?? DEFAULT_LOCAL_CONTEXT);
  }, []);

  useEffect(() => {
    void refreshLocalContextLength();
  }, [refreshLocalContextLength]);

  const isLocal = activeProvider === "local";
  const needsLocalModel =
    isLocal && (mode === "no_model" || mode === "offline_no_model");
  const needsOpenRouterKey = !isLocal && !hasOpenRouterKey;
  const needsCloudModel = !isLocal && hasOpenRouterKey && cloudModelId === null;
  const inputDisabled =
    needsLocalModel || needsOpenRouterKey || needsCloudModel;
  const maxContextTokens = isLocal ? localContextLength : cloudContextLength;

  const handleSend = useCallback(
    async (text: string) => {
      const prompt = text.trim();
      if (!prompt || isStreaming || inputDisabled) return;
      setInputText("");
      try {
        await sendMessage(prompt);
      } catch (error) {
        console.error("Failed to send message:", error);
      }
    },
    [inputDisabled, isStreaming, sendMessage],
  );

  const handleConfirmClear = useCallback(async () => {
    try {
      await clearHistory();
      setClearOpen(false);
    } catch (error) {
      console.error("Failed to clear chat history:", error);
    }
  }, [clearHistory]);

  const handleModelSelected = useCallback(() => {
    void refreshLocalModel();
    void refreshLocalContextLength();
  }, [refreshLocalModel, refreshLocalContextLength]);

  const hasMessages = messages.length > 0;
  const emptyVariant: ChatEmptyVariant = needsLocalModel
    ? "no_local_model"
    : needsOpenRouterKey
      ? "cloud_key_required"
      : "ready";

  const placeholder = needsLocalModel
    ? "Select a local model to chat..."
    : needsOpenRouterKey
      ? "Add OPENROUTER_API_KEY in Settings..."
      : needsCloudModel
        ? "Select a cloud model..."
        : "Ask about your memories... Type / for skills.";

  return (
    <SafeAreaView className="flex-1 bg-surface">
      <View className="flex-row items-center px-4 py-3">
        <Pressable
          onPress={() => navigation.dispatch(DrawerActions.openDrawer())}
          hitSlop={8}
        >
          <IconMenu2 size={24} color={theme.foreground} />
        </Pressable>
        <Text className="flex-1 text-center text-lg font-sans-semibold text-foreground">
          Chat
        </Text>
        {hasMessages ? (
          <Pressable
            onPress={() => setClearOpen(true)}
            disabled={isClearing || isStreaming}
            hitSlop={8}
            className={isClearing || isStreaming ? "opacity-40" : ""}
          >
            <IconTrash size={20} color={theme.muted} strokeWidth={1.5} />
          </Pressable>
        ) : (
          <View style={{ width: 24 }} />
        )}
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        {!hasMessages ? (
          <ChatEmptyState
            variant={emptyVariant}
            isLocal={isLocal}
            isOffline={!isOnline}
            onSuggestionTap={(text) => void handleSend(text)}
          />
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.key}
            renderItem={({ item }) => (
              <MessageBubble
                message={item}
                usage={usageByMessageKey[item.key]}
                memoryRefs={memoryRefsByMessageKey[item.key]}
                maxContextTokens={maxContextTokens}
              />
            )}
            contentContainerStyle={{
              paddingVertical: 16,
              paddingHorizontal: 16,
            }}
            onContentSizeChange={() =>
              flatListRef.current?.scrollToEnd({ animated: false })
            }
            onLayout={() =>
              flatListRef.current?.scrollToEnd({ animated: false })
            }
          />
        )}

        <ChatInputBar
          value={inputText}
          onChangeText={setInputText}
          onSend={() => void handleSend(inputText)}
          disabled={inputDisabled}
          isStreaming={isStreaming}
          placeholder={placeholder}
          skills={skills}
          showVoice={isLocal}
          footerLeft={
            <>
              <ProviderToggle
                provider={provider}
                onChange={setProvider}
                disabled={isStreaming || !isOnline}
              />
              {isLocal ? (
                <LocalModelSelectorSheet
                  disabled={isStreaming}
                  onModelSelected={handleModelSelected}
                />
              ) : (
                <CloudModelSelectorSheet
                  modelId={cloudModelId}
                  onSelectModel={setCloudModelId}
                  onContextLength={setCloudContextLength}
                  disabled={!hasOpenRouterKey || isStreaming}
                />
              )}
            </>
          }
        />
      </KeyboardAvoidingView>

      <ClearChatDialog
        visible={clearOpen}
        isClearing={isClearing}
        onCancel={() => setClearOpen(false)}
        onConfirm={() => void handleConfirmClear()}
      />
    </SafeAreaView>
  );
}
