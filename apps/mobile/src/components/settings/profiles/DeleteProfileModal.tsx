import { useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { IconCheck, IconTrash } from "@tabler/icons-react-native";
import { useColorScheme } from "nativewind";
import type { Doc, Id } from "@vmem/backend";
import AppModal from "@/components/ui/AppModal";
import { Text } from "@/components/ui/text";
import { THEME_COLORS } from "@/lib/theme";
import { getProfileIcon } from "./profileMeta";

interface DeleteProfileModalProps {
  profile: Doc<"profiles">;
  profiles: Doc<"profiles">[];
  visible: boolean;
  onClose: () => void;
  onDelete: (moveToProfileId: Id<"profiles"> | null) => Promise<void>;
}

/** Delete-with-migration dialog — port of web's DeleteProfileDialog. */
export default function DeleteProfileModal({
  profile,
  profiles,
  visible,
  onClose,
  onDelete,
}: DeleteProfileModalProps) {
  const [moveToProfileId, setMoveToProfileId] = useState<Id<"profiles"> | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);
  const { colorScheme } = useColorScheme();
  const theme = colorScheme === "dark" ? THEME_COLORS.dark : THEME_COLORS.light;

  const otherProfiles = profiles.filter((p) => p._id !== profile._id);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await onDelete(moveToProfileId);
      onClose();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AppModal
      visible={visible}
      onClose={onClose}
      title="Delete Profile"
      description={`Are you sure you want to delete "${profile.name}"? This action cannot be undone.`}
    >
      <View className="gap-4 py-4">
        <Text className="text-sm text-muted-foreground">
          What should happen to the memories in this profile?
        </Text>
        <View className="gap-2">
          <Pressable
            onPress={() => setMoveToProfileId(null)}
            className={`w-full flex-row items-center gap-3 rounded-lg p-3 ${
              moveToProfileId === null
                ? "bg-surface-tertiary"
                : "bg-surface-secondary active:bg-surface-tertiary/50"
            }`}
          >
            <IconTrash size={16} color={theme.destructive} />
            <View className="flex-1">
              <Text className="text-sm font-sans-medium text-overlay-foreground">
                Delete all memories
              </Text>
              <Text className="text-xs text-muted-foreground">
                Permanently remove all memories in this profile
              </Text>
            </View>
            {moveToProfileId === null && (
              <IconCheck size={16} color={theme.foreground} />
            )}
          </Pressable>

          {otherProfiles.map((p) => {
            const Icon = getProfileIcon(p.icon);
            const isSelected = moveToProfileId === p._id;
            return (
              <Pressable
                key={p._id}
                onPress={() => setMoveToProfileId(p._id)}
                className={`w-full flex-row items-center gap-3 rounded-lg p-3 ${
                  isSelected
                    ? "bg-surface-tertiary"
                    : "bg-surface-secondary active:bg-surface-tertiary/50"
                }`}
              >
                <View
                  className="h-6 w-6 items-center justify-center rounded"
                  style={{ backgroundColor: p.color + "20" }}
                >
                  <Icon size={14} color={p.color} />
                </View>
                <View className="flex-1">
                  <Text className="text-sm font-sans-medium text-overlay-foreground">
                    Move to {p.name}
                  </Text>
                  <Text className="text-xs text-muted-foreground">
                    Transfer all memories to this profile
                  </Text>
                </View>
                {isSelected && <IconCheck size={16} color={theme.foreground} />}
              </Pressable>
            );
          })}
        </View>
      </View>

      <View className="flex-row justify-end gap-2">
        <Pressable
          onPress={onClose}
          disabled={deleting}
          className="rounded-lg px-4 py-2.5 active:bg-surface-tertiary"
        >
          <Text className="text-sm text-muted-foreground">Cancel</Text>
        </Pressable>
        <Pressable
          onPress={() => void handleDelete()}
          disabled={deleting}
          className="flex-row items-center gap-2 rounded-lg bg-destructive px-4 py-2.5 active:opacity-90"
        >
          {deleting && <ActivityIndicator size="small" color="#fff" />}
          <Text className="text-sm font-sans-medium text-destructive-foreground">
            Delete Profile
          </Text>
        </Pressable>
      </View>
    </AppModal>
  );
}
