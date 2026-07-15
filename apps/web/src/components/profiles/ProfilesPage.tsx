import { useQuery, useMutation, useAction } from "convex/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button, Skeleton } from "@vmem/ui";
import { IconPlus } from "@tabler/icons-react";
import { api, type Id } from "@vmem/backend";
import PageContainer from "@/components/PageContainer";
import { CreateEditProfileDialog } from "./CreateEditProfileDialog";
import { DefaultProfilesSection } from "./DefaultProfilesSection";
import { ProfileCard } from "./ProfileCard";
import { ProfileDangerZone } from "./ProfileDangerZone";

export function ProfilesPage() {
  const profiles = useQuery(api.profiles.list);
  const createProfile = useMutation(api.profiles.create);
  const updateProfile = useMutation(api.profiles.update);
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

  useEffect(() => {
    if (!profiles) return;
    if (
      editingProfileId !== null &&
      !profiles.some((profile) => profile._id === editingProfileId)
    ) {
      setEditingProfileId(null);
    }
    if (
      deletingProfileId !== null &&
      !profiles.some((profile) => profile._id === deletingProfileId)
    ) {
      setDeletingProfileId(null);
    }
  }, [profiles, editingProfileId, deletingProfileId]);

  if (profiles === undefined) {
    return (
      <PageContainer title="Profiles" centeredMaxWidth showTitle>
        <div className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </PageContainer>
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
    <PageContainer
      title="Profiles"
      centeredMaxWidth
      showTitle
      rightSection={
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <IconPlus className="h-4 w-4 mr-1.5" />
          New Profile
        </Button>
      }
    >
      <div className="space-y-6">
        <DefaultProfilesSection profiles={profiles} />

        <div className="grid gap-4 sm:grid-cols-2">
          {profiles.map((profile) => (
            <ProfileCard
              key={profile._id}
              profile={profile}
              onEdit={() => setEditingProfileId(profile._id)}
              onDelete={() => setDeletingProfileId(profile._id)}
            />
          ))}
        </div>

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
                  err instanceof Error
                    ? err.message
                    : "Failed to update profile",
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
      </div>
    </PageContainer>
  );
}
