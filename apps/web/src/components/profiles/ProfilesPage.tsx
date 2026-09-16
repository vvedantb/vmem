import { useQuery, useMutation, useAction } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";
import { Button, Skeleton } from "@vmem/ui";
import { IconPlus } from "@tabler/icons-react";
import { api, type Id } from "@vmem/backend";
import { tempId } from "@/lib/convex-optimistic";
import { SettingsPage } from "@/components/settings/SettingsPage";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { CreateEditProfileDialog } from "./CreateEditProfileDialog";
import { DefaultProfilesSection } from "./DefaultProfilesSection";
import { ProfileCard } from "./ProfileCard";
import { ProfileDangerZone } from "./ProfileDangerZone";

export function ProfilesPage() {
  const profiles = useQuery(api.profiles.list);
  const createProfile = useMutation(api.profiles.create).withOptimisticUpdate(
    (localStore, args) => {
      const list = localStore.getQuery(api.profiles.list, {});
      if (list === undefined) return;
      const now = Date.now();
      const optimisticId = tempId<"profiles">();
      localStore.setQuery(api.profiles.list, {}, [
        ...list,
        {
          _id: optimisticId,
          _creationTime: now,
          userId: list[0]?.userId ?? tempId<"users">(),
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
      if (list === undefined) return;
      localStore.setQuery(
        api.profiles.list,
        {},
        list.map((p) =>
          p._id === args.profileId
            ? {
                ...p,
                ...(args.name !== undefined ? { name: args.name } : {}),
                ...(args.color !== undefined ? { color: args.color } : {}),
                ...(args.icon !== undefined ? { icon: args.icon } : {}),
                updatedAt: Date.now(),
              }
            : p,
        ),
      );
    },
  );
  const removeProfileWithMemories = useAction(api.profiles.removeWithMemories);

  const [createOpen, setCreateOpen] = useState(false);
  const [editingProfileId, setEditingProfileId] =
    useState<Id<"profiles"> | null>(null);
  const [deletingProfileId, setDeletingProfileId] =
    useState<Id<"profiles"> | null>(null);

  const editingProfile =
    editingProfileId !== null && profiles !== undefined
      ? profiles.find((profile) => profile._id === editingProfileId)
      : undefined;
  const deletingProfile =
    deletingProfileId !== null && profiles !== undefined
      ? profiles.find((profile) => profile._id === deletingProfileId)
      : undefined;

  if (profiles === undefined) {
    return (
      <SettingsPage title="Profiles">
        <SettingsSection title="Default profiles">
          <Skeleton className="h-24 w-full" />
        </SettingsSection>
        <SettingsSection title="Workspaces">
          <Skeleton className="h-24 w-full" />
        </SettingsSection>
      </SettingsPage>
    );
  }

  const handleCreate = async (data: Parameters<typeof createProfile>[0]) => {
    await createProfile(data);
  };

  const handleDelete = async (moveToProfileId: Id<"profiles"> | null) => {
    if (!deletingProfile) return;

    await removeProfileWithMemories({
      profileId: deletingProfile._id,
      moveMemoriesToProfileId: moveToProfileId ?? undefined,
    });
  };

  return (
    <SettingsPage
      title="Profiles"
      headerRight={
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <IconPlus className="h-4 w-4" />
          New
          <span className="max-sm:sr-only"> Profile</span>
        </Button>
      }
    >
      <DefaultProfilesSection profiles={profiles} />

      <SettingsSection
        title="Workspaces"
        description="Each profile is a separate memory workspace."
        bodyClassName="grid gap-4 sm:grid-cols-2"
      >
        {profiles.map((profile) => (
          <ProfileCard
            key={profile._id}
            profile={profile}
            onEdit={() => setEditingProfileId(profile._id)}
            onDelete={() => setDeletingProfileId(profile._id)}
          />
        ))}
      </SettingsSection>

      <CreateEditProfileDialog
        profile={null}
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSave={handleCreate}
      />

      {editingProfile && (
        <CreateEditProfileDialog
          profile={editingProfile}
          open={!!editingProfile}
          onOpenChange={(open) => !open && setEditingProfileId(null)}
          onFieldUpdate={(patch) => {
            void updateProfile({
              profileId: editingProfile._id,
              ...patch,
            }).catch((err: unknown) => {
              toast.error(
                err instanceof Error ? err.message : "Failed to update profile",
              );
            });
          }}
        />
      )}

      {deletingProfile && (
        <ProfileDangerZone
          profile={deletingProfile}
          profiles={profiles}
          open={!!deletingProfile}
          onOpenChange={(open) => !open && setDeletingProfileId(null)}
          onDelete={handleDelete}
        />
      )}
    </SettingsPage>
  );
}
