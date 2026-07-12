import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  IconClipboard,
  IconInfoCircle,
  IconKey,
  IconPlus,
} from "@tabler/icons-react-native";
import { useColorScheme } from "nativewind";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@vmem/backend";
import BulkPasteModal from "@/components/settings/secrets/BulkPasteModal";
import EnvVarFormModal from "@/components/settings/secrets/EnvVarFormModal";
import EnvVarRow from "@/components/settings/secrets/EnvVarRow";
import SettingsHeader from "@/components/settings/SettingsHeader";
import { Text } from "@/components/ui/text";
import { THEME_COLORS } from "@/lib/theme";

/** Port of web /settings/secrets — encrypted env vars (rows instead of a table). */
export default function SecretsScreen() {
  const vars = useQuery(api.userEnvVars.list, {});
  const upsert = useAction(api.userEnvVarsActions.upsertVar);
  const edit = useAction(api.userEnvVarsActions.editVar);
  const reveal = useAction(api.userEnvVarsActions.revealValue);
  const bulkImport = useAction(api.userEnvVarsActions.bulkUpsert);
  const remove = useMutation(api.userEnvVars.removeVar).withOptimisticUpdate(
    (localStore, args) => {
      const list = localStore.getQuery(api.userEnvVars.list, {});
      if (!list) return;
      localStore.setQuery(
        api.userEnvVars.list,
        {},
        list.filter((entry) => entry.key !== args.key),
      );
    },
  );

  const [formOpen, setFormOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [revealedValues, setRevealedValues] = useState<Record<string, string>>(
    {},
  );
  const { colorScheme } = useColorScheme();
  const theme = colorScheme === "dark" ? THEME_COLORS.dark : THEME_COLORS.light;

  const sortedVars = (vars ?? [])
    .slice()
    .sort((a, b) => a.key.localeCompare(b.key));

  const toggleReveal = async (key: string) => {
    if (revealedValues[key] !== undefined) {
      setRevealedValues((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      return;
    }
    try {
      const value = await reveal({ key });
      if (value !== null) {
        setRevealedValues((prev) => ({ ...prev, [key]: value }));
      }
    } catch (err) {
      console.error("Failed to reveal value:", err);
    }
  };

  const resolveValue = async (key: string): Promise<string | null> => {
    const revealed = revealedValues[key];
    if (revealed !== undefined) return revealed;
    return reveal({ key });
  };

  const handleDelete = (key: string) => {
    Alert.alert(
      "Delete Variable",
      `Are you sure you want to delete ${key}? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            setRevealedValues((prev) => {
              const next = { ...prev };
              delete next[key];
              return next;
            });
            void remove({ key });
          },
        },
      ],
    );
  };

  const handleSave = async (key: string, value: string | undefined) => {
    if (editingKey !== null) {
      await edit({ oldKey: editingKey, newKey: key, value });
      setRevealedValues((prev) => {
        const next = { ...prev };
        delete next[editingKey];
        delete next[key];
        return next;
      });
    } else {
      if (value === undefined) return;
      await upsert({ key, value });
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-surface">
      <SettingsHeader title="Secrets" variant="back" />
      <ScrollView
        className="flex-1 px-4"
        contentContainerStyle={{ paddingBottom: 32 }}
      >
        <View className="flex-row items-start gap-3 rounded-xl bg-card p-4">
          <IconInfoCircle
            size={16}
            color={theme.muted}
            strokeWidth={1.5}
            style={{ marginTop: 2 }}
          />
          <Text className="flex-1 text-sm text-muted-foreground">
            Secrets (e.g. OPENROUTER_API_KEY) used by server-side actions when
            calling third-party providers on your behalf. Values are encrypted
            at rest.
          </Text>
        </View>

        <View className="my-4 flex-row justify-end gap-2">
          <Pressable
            onPress={() => setBulkOpen(true)}
            className="flex-row items-center gap-1.5 rounded-lg bg-surface-secondary px-3 py-2 active:bg-surface-tertiary"
          >
            <IconClipboard size={16} color={theme.foreground} />
            <Text className="text-sm text-foreground">Paste</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              setEditingKey(null);
              setFormOpen(true);
            }}
            className="flex-row items-center gap-1.5 rounded-lg bg-accent px-3 py-2 active:opacity-90"
          >
            <IconPlus size={16} color={theme.accentForeground} />
            <Text className="text-sm font-sans-medium text-accent-foreground">
              Add Variable
            </Text>
          </Pressable>
        </View>

        {vars === undefined ? (
          <View className="items-center py-12">
            <ActivityIndicator />
          </View>
        ) : sortedVars.length === 0 ? (
          <View className="items-center py-16">
            <IconKey size={48} color={theme.muted} opacity={0.4} />
            <Text className="mt-3 text-sm text-muted-foreground">
              No environment variables configured
            </Text>
          </View>
        ) : (
          <View className="gap-2">
            {sortedVars.map((entry) => (
              <EnvVarRow
                key={entry.key}
                varKey={entry.key}
                displayValue={revealedValues[entry.key] ?? entry.value}
                isRevealed={revealedValues[entry.key] !== undefined}
                onToggleReveal={() => void toggleReveal(entry.key)}
                onResolveValue={() => resolveValue(entry.key)}
                onEdit={() => {
                  setEditingKey(entry.key);
                  setFormOpen(true);
                }}
                onDelete={() => handleDelete(entry.key)}
              />
            ))}
          </View>
        )}
      </ScrollView>

      <EnvVarFormModal
        editingKey={editingKey}
        visible={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditingKey(null);
        }}
        onSave={handleSave}
      />

      <BulkPasteModal
        visible={bulkOpen}
        onClose={() => setBulkOpen(false)}
        onImport={async (entries) => {
          await bulkImport({ entries });
        }}
      />
    </SafeAreaView>
  );
}
