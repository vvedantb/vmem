import { Pressable, View } from "react-native";
import { IconEdit, IconTrash } from "@tabler/icons-react-native";
import { useColorScheme } from "nativewind";
import type { Doc } from "@vmem/backend";
import { Text } from "@/components/ui/text";
import { THEME_COLORS } from "@/lib/theme";
import { getProfileIcon } from "./profileMeta";

interface ProfileCardProps {
  profile: Doc<"profiles">;
  onEdit: () => void;
  onDelete: () => void;
}

/** Port of web's ProfileCard (single-column on phone). */
export default function ProfileCard({
  profile,
  onEdit,
  onDelete,
}: ProfileCardProps) {
  const Icon = getProfileIcon(profile.icon);
  const { colorScheme } = useColorScheme();
  const theme = colorScheme === "dark" ? THEME_COLORS.dark : THEME_COLORS.light;

  return (
    <View className="rounded-xl bg-card p-4">
      <View className="flex-row items-start gap-3">
        <View
          className="h-10 w-10 items-center justify-center rounded-lg"
          style={{ backgroundColor: profile.color + "20" }}
        >
          <Icon size={20} color={profile.color} />
        </View>
        <View className="min-w-0 flex-1">
          <View className="flex-row items-center gap-2">
            <Text
              className="font-sans-medium text-foreground"
              numberOfLines={1}
            >
              {profile.name}
            </Text>
            {profile.isDefault && (
              <View className="rounded bg-surface-secondary px-1.5 py-0.5">
                <Text className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Default
                </Text>
              </View>
            )}
          </View>
          <Text className="mt-0.5 text-xs text-muted-foreground">
            Created{" "}
            {new Date(profile.createdAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </Text>
        </View>
        <View className="flex-row items-center gap-1">
          <Pressable onPress={onEdit} className="p-2" hitSlop={4}>
            <IconEdit size={16} color={theme.muted} />
          </Pressable>
          {!profile.isDefault && (
            <Pressable onPress={onDelete} className="p-2" hitSlop={4}>
              <IconTrash size={16} color={theme.destructive} />
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}
