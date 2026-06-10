import { useCallback, useState } from "react";
import { Pressable, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import {
  IconCheck,
  IconCloud,
  IconCopy,
  IconMicrophone,
} from "@tabler/icons-react-native";
import { useColorScheme } from "nativewind";
import BottomSheet from "@/components/ui/BottomSheet";
import { Text } from "@/components/ui/text";
import { THEME_COLORS } from "@/lib/theme";
import type { MessageUsageSummary } from "@/hooks/useChatProvider";

function UsageRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between py-1.5">
      <Text className="text-sm text-muted-foreground">{label}</Text>
      <Text className="text-sm tabular-nums text-overlay-foreground">
        {value}
      </Text>
    </View>
  );
}

interface MessageActionsProps {
  text: string;
  agentName?: string;
  usage?: MessageUsageSummary;
  maxContextTokens: number;
}

/**
 * Copy + provider badge + token-usage pill under an assistant message —
 * port of web's Actions row (always visible; no hover on mobile). The usage
 * popover becomes a bottom sheet.
 */
export default function MessageActions({
  text,
  agentName,
  usage,
  maxContextTokens,
}: MessageActionsProps) {
  const [copied, setCopied] = useState(false);
  const [usageOpen, setUsageOpen] = useState(false);
  const { colorScheme } = useColorScheme();
  const theme = colorScheme === "dark" ? THEME_COLORS.dark : THEME_COLORS.light;

  const handleCopy = useCallback(async () => {
    await Clipboard.setStringAsync(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [text]);

  const ProviderIcon =
    agentName === "vmem-cloud"
      ? IconCloud
      : agentName === "vmem-local-voice"
        ? IconMicrophone
        : null;

  const pct =
    usage && maxContextTokens > 0
      ? Math.min(100, (usage.totalTokens / maxContextTokens) * 100)
      : 0;

  return (
    <View className="mt-1 flex-row items-center gap-1">
      <Pressable onPress={() => void handleCopy()} className="p-1" hitSlop={6}>
        {copied ? (
          <IconCheck size={14} color={theme.muted} />
        ) : (
          <IconCopy size={14} color={theme.muted} />
        )}
      </Pressable>

      {ProviderIcon && (
        <View className="p-1">
          <ProviderIcon size={14} color={theme.muted} strokeWidth={1.5} />
        </View>
      )}

      {usage && (
        <Pressable
          onPress={() => setUsageOpen(true)}
          className="rounded-full bg-default px-2 py-0.5"
        >
          <Text className="text-[11px] tabular-nums text-muted-foreground">
            {pct < 1 ? "<1" : Math.round(pct)}% · {usage.totalTokens} tok
          </Text>
        </Pressable>
      )}

      {usage && (
        <BottomSheet
          visible={usageOpen}
          onClose={() => setUsageOpen(false)}
          title="Context usage"
        >
          <View className="px-5 pb-5">
            <Text className="mb-2 text-xs text-muted-foreground">
              {usage.totalTokens.toLocaleString()} /{" "}
              {maxContextTokens.toLocaleString()} tokens (
              {pct < 1 ? "<1" : Math.round(pct)}%)
            </Text>
            <UsageRow
              label="Input tokens"
              value={usage.inputTokens.toLocaleString()}
            />
            <UsageRow
              label="Output tokens"
              value={usage.outputTokens.toLocaleString()}
            />
            <UsageRow
              label="Reasoning tokens"
              value={usage.reasoningTokens.toLocaleString()}
            />
            <UsageRow
              label="Cached tokens"
              value={usage.cachedInputTokens.toLocaleString()}
            />
            {usage.tokensPerSecond !== undefined &&
              usage.tokensPerSecond > 0 && (
                <UsageRow
                  label="Speed"
                  value={`${usage.tokensPerSecond.toFixed(1)} tok/s`}
                />
              )}
          </View>
        </BottomSheet>
      )}
    </View>
  );
}
