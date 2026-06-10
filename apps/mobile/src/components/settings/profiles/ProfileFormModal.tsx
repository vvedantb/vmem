import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { useColorScheme } from "nativewind";
import type { Doc } from "@vmem/backend";
import AppModal from "@/components/ui/AppModal";
import { Input } from "@/components/ui/Input";
import { Text } from "@/components/ui/text";
import { THEME_COLORS } from "@/lib/theme";
import { PROFILE_COLORS, PROFILE_ICONS } from "./profileMeta";

interface ProfileFormModalProps {
  /** null = create mode. */
  profile: Doc<"profiles"> | null;
  visible: boolean;
  onClose: () => void;
  onSave: (data: {
    name: string;
    color: string;
    icon: string;
  }) => Promise<void>;
}

/** Create/edit profile dialog — port of web's CreateEditProfileDialog. */
export default function ProfileFormModal({
  profile,
  visible,
  onClose,
  onSave,
}: ProfileFormModalProps) {
  const [name, setName] = useState(profile?.name ?? "");
  const [color, setColor] = useState<string>(
    profile?.color ?? PROFILE_COLORS[0],
  );
  const [icon, setIcon] = useState(profile?.icon ?? "user");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { colorScheme } = useColorScheme();
  const theme = colorScheme === "dark" ? THEME_COLORS.dark : THEME_COLORS.light;

  // Re-seed the form whenever the dialog opens for a different profile.
  useEffect(() => {
    if (visible) {
      setName(profile?.name ?? "");
      setColor(profile?.color ?? PROFILE_COLORS[0]);
      setIcon(profile?.icon ?? "user");
      setError(null);
    }
  }, [visible, profile]);

  const handleSave = async () => {
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({ name: name.trim(), color, icon });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save profile");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppModal
      visible={visible}
      onClose={onClose}
      title={profile ? "Edit Profile" : "Create Profile"}
      description={
        profile
          ? "Update your profile settings"
          : "Create a new profile to organize your memories"
      }
    >
      <View className="gap-4 py-4">
        <View className="gap-2">
          <Text className="text-sm font-sans-medium text-overlay-foreground">
            Name
          </Text>
          <Input
            value={name}
            onChangeText={setName}
            placeholder="e.g. Work, Personal, Study"
          />
        </View>

        <View className="gap-2">
          <Text className="text-sm font-sans-medium text-overlay-foreground">
            Color
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {PROFILE_COLORS.map((c) => (
              <Pressable
                key={c}
                onPress={() => setColor(c)}
                className="h-8 w-8 items-center justify-center rounded-full"
                style={{
                  backgroundColor: c,
                  borderWidth: color === c ? 2 : 0,
                  borderColor: theme.foreground,
                  transform: [{ scale: color === c ? 1.1 : 1 }],
                }}
              />
            ))}
          </View>
        </View>

        <View className="gap-2">
          <Text className="text-sm font-sans-medium text-overlay-foreground">
            Icon
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {PROFILE_ICONS.map((entry) => {
              const IconComponent = entry.icon;
              const isSelected = icon === entry.name;
              return (
                <Pressable
                  key={entry.name}
                  onPress={() => setIcon(entry.name)}
                  className={`h-9 w-9 items-center justify-center rounded-lg ${
                    isSelected ? "bg-segment" : "bg-surface-secondary"
                  }`}
                >
                  <IconComponent size={16} color={theme.foreground} />
                </Pressable>
              );
            })}
          </View>
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
          disabled={saving}
          className="flex-row items-center gap-2 rounded-lg bg-accent px-4 py-2.5 active:opacity-90"
        >
          {saving && (
            <ActivityIndicator size="small" color={theme.accentForeground} />
          )}
          <Text className="text-sm font-sans-medium text-accent-foreground">
            {profile ? "Save Changes" : "Create Profile"}
          </Text>
        </Pressable>
      </View>
    </AppModal>
  );
}
