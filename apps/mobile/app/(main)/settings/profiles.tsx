import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { IconPlus } from "@tabler/icons-react-native";
import { useColorScheme } from "nativewind";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@vmem/backend";
import type { Doc, Id } from "@vmem/backend";
import DefaultProfilesCard from "@/components/settings/profiles/DefaultProfilesCard";
import DeleteProfileModal from "@/components/settings/profiles/DeleteProfileModal";
import ProfileCard from "@/components/settings/profiles/ProfileCard";
import ProfileFormModal from "@/components/settings/profiles/ProfileFormModal";
import SettingsHeader from "@/components/settings/SettingsHeader";
import { Text } from "@/components/ui/text";
import { optimisticId } from "@/lib/optimisticId";
import { THEME_COLORS } from "@/lib/theme";

/** Port of web /settings/profiles — CRUD + defaults per source. */
export default function ProfilesScreen() {
  const profiles = useQuery(api.profiles.list);
  const { colorScheme } = useColorScheme();
  const theme = colorScheme === "dark" ? THEME_COLORS.dark : THEME_COLORS.light;

  const createProfile = useMutation(api.profiles.create).withOptimisticUpdate(
    (localStore, args) => {
      const list = localStore.getQuery(api.profiles.list, {});
      if (!list || list.length === 0) return;
      const firstProfile = list.at(0);
      if (!firstProfile) return;
      const now = Date.now();
      const tempId = optimisticId("profiles");
      localStore.setQuery(api.profiles.list, {}, [
        ...list,
        {
          _id: tempId,
          _creationTime: now,
          userId: firstProfile.userId,
          name: args.name,
          color: args.color,
          icon: args.icon,
          isDefault: false,
          createdAt: now,
          updatedAt: now,
        },
      ]);
    },
  );
  const updateProfile = useMutation(api.profiles.update).withOptimisticUpdate(
    (localStore, args) => {
      const list = localStore.getQuery(api.profiles.list, {});
      if (!list) return;
      const now = Date.now();
      localStore.setQuery(
        api.profiles.list,
        {},
        list.map((profile) =>
          profile._id === args.profileId
            ? {
                ...profile,
                ...(args.name !== undefined ? { name: args.name } : {}),
                ...(args.color !== undefined ? { color: args.color } : {}),
                ...(args.icon !== undefined ? { icon: args.icon } : {}),
                updatedAt: now,
              }
            : profile,
        ),
      );
    },
  );
  const removeProfileWithMemories = useAction(api.profiles.removeWithMemories);

  const [createOpen, setCreateOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<Doc<"profiles"> | null>(
    null,
  );
  const [deletingProfile, setDeletingProfile] =
    useState<Doc<"profiles"> | null>(null);

  const handleEdit = async (data: {
    name: string;
    color: string;
    icon: string;
  }) => {
    if (!editingProfile) return;
    await updateProfile({ profileId: editingProfile._id, ...data });
  };

  const handleDelete = async (moveToProfileId: Id<"profiles"> | null) => {
    if (!deletingProfile) return;
    await removeProfileWithMemories({
      profileId: deletingProfile._id,
      moveMemoriesToProfileId: moveToProfileId ?? undefined,
    });
  };

  return (
    <SafeAreaView className="flex-1 bg-surface">
      <SettingsHeader title="Profiles" variant="back" />
      {profiles === undefined ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      ) : (
        <ScrollView
          className="flex-1 px-4"
          contentContainerStyle={{ paddingBottom: 32 }}
        >
          <View className="mb-3 flex-row items-center justify-between">
            <View>
              <Text className="text-base font-sans-medium text-foreground">
                Default Profiles
              </Text>
              <Text className="mt-0.5 text-xs text-muted-foreground">
                Choose which profile new memories are saved to by default
              </Text>
            </View>
          </View>
          <DefaultProfilesCard profiles={profiles} />

          <View className="mb-3 mt-6 flex-row items-center justify-between">
            <Text className="text-base font-sans-medium text-foreground">
              Profiles
            </Text>
            <Pressable
              onPress={() => setCreateOpen(true)}
              className="flex-row items-center gap-1.5 rounded-lg bg-accent px-3 py-2 active:opacity-90"
            >
              <IconPlus size={16} color={theme.accentForeground} />
              <Text className="text-sm font-sans-medium text-accent-foreground">
                New Profile
              </Text>
            </Pressable>
          </View>
          <View className="gap-3">
            {profiles.map((profile) => (
              <ProfileCard
                key={profile._id}
                profile={profile}
                onEdit={() => setEditingProfile(profile)}
                onDelete={() => setDeletingProfile(profile)}
              />
            ))}
          </View>
        </ScrollView>
      )}

      <ProfileFormModal
        profile={null}
        visible={createOpen}
        onClose={() => setCreateOpen(false)}
        onSave={async (data) => {
          await createProfile(data);
        }}
      />

      {editingProfile && (
        <ProfileFormModal
          profile={editingProfile}
          visible={editingProfile !== null}
          onClose={() => setEditingProfile(null)}
          onSave={handleEdit}
        />
      )}

      {deletingProfile && profiles && (
        <DeleteProfileModal
          profile={deletingProfile}
          profiles={profiles}
          visible={deletingProfile !== null}
          onClose={() => setDeletingProfile(null)}
          onDelete={handleDelete}
        />
      )}
    </SafeAreaView>
  );
}
