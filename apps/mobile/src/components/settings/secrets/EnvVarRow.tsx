import { useState } from "react";
import { Pressable, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import {
  IconCheck,
  IconCopy,
  IconEye,
  IconEyeOff,
  IconPencil,
  IconTrash,
} from "@tabler/icons-react-native";
import { useColorScheme } from "nativewind";
import { Text } from "@/components/ui/text";
import { THEME_COLORS } from "@/lib/theme";

interface EnvVarRowProps {
  varKey: string;
  /** Masked value from the list query, or the revealed plaintext. */
  displayValue: string;
  isRevealed: boolean;
  onToggleReveal: () => void;
  /** Resolves the plaintext for copying (reveals if needed). */
  onResolveValue: () => Promise<string | null>;
  onEdit: () => void;
  onDelete: () => void;
}

/** One secret row: mono key, masked/revealed value, reveal/copy/edit/delete. */
export default function EnvVarRow({
  varKey,
  displayValue,
  isRevealed,
  onToggleReveal,
  onResolveValue,
  onEdit,
  onDelete,
}: EnvVarRowProps) {
  const [copied, setCopied] = useState(false);
  const { colorScheme } = useColorScheme();
  const theme = colorScheme === "dark" ? THEME_COLORS.dark : THEME_COLORS.light;

  const handleCopy = async () => {
    const value = await onResolveValue();
    if (value === null) return;
    await Clipboard.setStringAsync(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <View className="flex-row items-center gap-3 rounded-xl bg-card px-3 py-3">
      <View className="min-w-0 flex-1">
        <Text
          className="text-xs text-foreground"
          style={{ fontFamily: "monospace" }}
          numberOfLines={1}
        >
          {varKey}
        </Text>
        <Text
          className="mt-1 text-xs text-muted-foreground"
          style={{ fontFamily: "monospace" }}
          numberOfLines={1}
        >
          {displayValue}
        </Text>
      </View>
      <View className="flex-row items-center">
        <Pressable onPress={onToggleReveal} className="p-2" hitSlop={2}>
          {isRevealed ? (
            <IconEyeOff size={14} color={theme.muted} />
          ) : (
            <IconEye size={14} color={theme.muted} />
          )}
        </Pressable>
        <Pressable
          onPress={() => void handleCopy()}
          className="p-2"
          hitSlop={2}
        >
          {copied ? (
            <IconCheck size={14} color={theme.success} />
          ) : (
            <IconCopy size={14} color={theme.muted} />
          )}
        </Pressable>
        <Pressable onPress={onEdit} className="p-2" hitSlop={2}>
          <IconPencil size={14} color={theme.muted} />
        </Pressable>
        <Pressable onPress={onDelete} className="p-2" hitSlop={2}>
          <IconTrash size={14} color={theme.destructive} />
        </Pressable>
      </View>
    </View>
  );
}
