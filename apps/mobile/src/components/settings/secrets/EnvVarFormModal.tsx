import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { useColorScheme } from "nativewind";
import AppModal from "@/components/ui/AppModal";
import { Input } from "@/components/ui/Input";
import { Text } from "@/components/ui/text";
import { THEME_COLORS } from "@/lib/theme";

interface EnvVarFormModalProps {
  /** null = add mode; otherwise the key being edited. */
  editingKey: string | null;
  visible: boolean;
  onClose: () => void;
  /** Add: (key, value). Edit: (newKey, value?) — blank value keeps the stored ciphertext. */
  onSave: (key: string, value: string | undefined) => Promise<void>;
}

/** Add/edit secret dialog. Server-side key validation errors surface inline. */
export default function EnvVarFormModal({
  editingKey,
  visible,
  onClose,
  onSave,
}: EnvVarFormModalProps) {
  const [keyDraft, setKeyDraft] = useState("");
  const [valueDraft, setValueDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { colorScheme } = useColorScheme();
  const theme = colorScheme === "dark" ? THEME_COLORS.dark : THEME_COLORS.light;

  const isEdit = editingKey !== null;

  useEffect(() => {
    if (visible) {
      setKeyDraft(editingKey ?? "");
      setValueDraft("");
      setError(null);
    }
  }, [visible, editingKey]);

  const canSave = isEdit
    ? keyDraft.trim().length > 0
    : keyDraft.trim().length > 0 && valueDraft.trim().length > 0;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const value = isEdit
        ? valueDraft.trim()
          ? valueDraft
          : undefined
        : valueDraft;
      await onSave(keyDraft.trim(), value);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppModal
      visible={visible}
      onClose={onClose}
      title={isEdit ? "Edit Variable" : "Add Variable"}
    >
      <View className="gap-4 py-4">
        <View className="gap-2">
          <Text className="text-sm font-sans-medium text-overlay-foreground">
            Key
          </Text>
          <Input
            value={keyDraft}
            onChangeText={setKeyDraft}
            placeholder="e.g. OPENROUTER_API_KEY"
            autoCapitalize="characters"
            autoCorrect={false}
            style={{ fontFamily: "monospace", fontSize: 13 }}
          />
        </View>
        <View className="gap-2">
          <Text className="text-sm font-sans-medium text-overlay-foreground">
            Value
          </Text>
          <Input
            value={valueDraft}
            onChangeText={setValueDraft}
            placeholder={
              isEdit ? "New value (leave blank to keep)" : "Enter value"
            }
            autoCapitalize="none"
            autoCorrect={false}
            style={{ fontFamily: "monospace", fontSize: 13 }}
          />
        </View>
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
          onPress={() => void handleSave()}
          disabled={!canSave || saving}
          className={`flex-row items-center gap-2 rounded-lg bg-accent px-4 py-2.5 active:opacity-90 ${
            !canSave || saving ? "opacity-50" : ""
          }`}
        >
          {saving && (
            <ActivityIndicator size="small" color={theme.accentForeground} />
          )}
          <Text className="text-sm font-sans-medium text-accent-foreground">
            Save
          </Text>
        </Pressable>
      </View>
    </AppModal>
  );
}
