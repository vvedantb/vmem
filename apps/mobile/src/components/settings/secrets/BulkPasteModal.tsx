import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, TextInput, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { useColorScheme } from "nativewind";
import { parseEnvVars } from "@vmem/shared";
import AppModal from "@/components/ui/AppModal";
import { Text } from "@/components/ui/text";
import { THEME_COLORS } from "@/lib/theme";

interface BulkPasteModalProps {
  visible: boolean;
  onClose: () => void;
  onImport: (entries: Array<{ key: string; value: string }>) => Promise<void>;
}

/** Bulk .env import — port of web's Paste dialog, pre-filled from the clipboard. */
export default function BulkPasteModal({
  visible,
  onClose,
  onImport,
}: BulkPasteModalProps) {
  const [bulkText, setBulkText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { colorScheme } = useColorScheme();
  const theme = colorScheme === "dark" ? THEME_COLORS.dark : THEME_COLORS.light;

  // Pre-fill from the clipboard when it looks like KEY=VALUE lines.
  useEffect(() => {
    if (!visible) {
      setBulkText("");
      setError(null);
      return;
    }
    void Clipboard.getStringAsync()
      .then((text) => {
        if (text && parseEnvVars(text).length > 0) setBulkText(text);
      })
      .catch(() => undefined);
  }, [visible]);

  const parsed = parseEnvVars(bulkText);

  const handleImport = async () => {
    if (parsed.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      await onImport(parsed);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to import");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppModal
      visible={visible}
      onClose={onClose}
      title="Paste Environment Variables"
      description="Paste your variables in KEY=VALUE format, one per line. Lines starting with # are ignored."
    >
      <View className="gap-3 py-4">
        <TextInput
          value={bulkText}
          onChangeText={setBulkText}
          placeholder={"OPENROUTER_API_KEY=sk-or-...\nANOTHER_KEY=value"}
          placeholderTextColor={theme.muted}
          multiline
          className="rounded-lg bg-surface-secondary/60 px-3 py-3 text-xs text-overlay-foreground"
          style={{
            minHeight: 140,
            textAlignVertical: "top",
            fontFamily: "monospace",
          }}
        />
        {parsed.length > 0 && (
          <Text className="text-xs text-muted-foreground">
            {parsed.length} variable{parsed.length !== 1 ? "s" : ""} detected
          </Text>
        )}
        {error && <Text className="text-sm text-destructive">{error}</Text>}
      </View>

      <View className="flex-row justify-end gap-2">
        <Pressable
          onPress={onClose}
          className="rounded-lg px-4 py-2.5 active:bg-surface-tertiary"
        >
          <Text className="text-sm text-muted-foreground">Cancel</Text>
        </Pressable>
        <Pressable
          onPress={() => void handleImport()}
          disabled={parsed.length === 0 || saving}
          className={`flex-row items-center gap-2 rounded-lg bg-accent px-4 py-2.5 active:opacity-90 ${
            parsed.length === 0 || saving ? "opacity-50" : ""
          }`}
        >
          {saving && (
            <ActivityIndicator size="small" color={theme.accentForeground} />
          )}
          <Text className="text-sm font-sans-medium text-accent-foreground">
            Import{parsed.length > 0 ? ` ${parsed.length}` : ""}
          </Text>
        </Pressable>
      </View>
    </AppModal>
  );
}
