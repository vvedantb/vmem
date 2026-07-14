import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useAction } from "convex/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Button,
  Label,
  Skeleton,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  cn,
  Card,
  CardContent,
} from "@vmem/ui";
import {
  IconPlus,
  IconEdit,
  IconTrash,
  IconCheck,
  IconBrandChrome,
  IconLoader2,
} from "@tabler/icons-react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@vmem/backend";
import type { Id } from "@vmem/backend";
import { optimisticId } from "@/lib/optimisticId";
import PageContainer from "@/components/PageContainer";
import { ProfileAvatar } from "@/components/profiles/ProfileAvatar";
import { CreateEditProfileDialog } from "@/components/profiles/CreateEditProfileDialog";

export const Route = createFileRoute("/_main/settings/profiles")({
  component: ProfilesPage,
});

type Profile = FunctionReturnType<typeof api.profiles.list>[number];

function ProfileCard({
  profile,
  onEdit,
  onDelete,
}: {
  profile: Profile;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <Card className="relative shadow-none">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <ProfileAvatar
            icon={profile.icon}
            color={profile.color}
            className="h-10 w-10 rounded-lg"
            iconClassName="h-5 w-5"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-medium text-foreground truncate">
                {profile.name}
              </h3>
              {profile.isDefault && (
                <span className="text-[10px] uppercase tracking-wider text-muted bg-surface-secondary px-1.5 py-0.5 rounded">
                  Default
                </span>
              )}
            </div>
            <p className="text-xs text-muted mt-0.5">
              Created{" "}
              {new Date(profile.createdAt).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </p>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2 pt-3">
          <Button variant="ghost" size="icon-sm" onClick={onEdit}>
            <IconEdit className="h-4 w-4" />
          </Button>
          {!profile.isDefault && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onDelete}
              className="text-danger hover:text-danger"
            >
              <IconTrash className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function DeleteProfileDialog({
  profile,
  profiles,
  open,
  onOpenChange,
  onDelete,
}: {
  profile: Profile;
  profiles: Profile[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete: (moveToProfileId: Id<"profiles"> | null) => Promise<void>;
}) {
  const [moveToProfileId, setMoveToProfileId] = useState<Id<"profiles"> | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);

  const otherProfiles = profiles.filter((p) => p._id !== profile._id);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await onDelete(moveToProfileId);
      onOpenChange(false);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Profile</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete "{profile.name}"? This action cannot
            be undone.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-4">
          <p className="text-sm text-muted">
            What should happen to the memories in this profile?
          </p>
          <div className="space-y-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setMoveToProfileId(null)}
              className={cn(
                "h-auto w-full justify-start gap-3 rounded-lg p-3 text-left transition-colors active:scale-100",
                moveToProfileId === null
                  ? "bg-surface-tertiary text-foreground hover:bg-surface-tertiary"
                  : "bg-surface-secondary hover:bg-surface-tertiary/50",
              )}
            >
              <IconTrash className="h-4 w-4 text-danger" />
              <div>
                <p className="text-sm font-medium">Delete all memories</p>
                <p className="text-xs text-muted">
                  Permanently remove all memories in this profile
                </p>
              </div>
              {moveToProfileId === null && (
                <IconCheck className="h-4 w-4 ml-auto" />
              )}
            </Button>
            {otherProfiles.map((p) => (
              <Button
                key={p._id}
                type="button"
                variant="ghost"
                onClick={() => setMoveToProfileId(p._id)}
                className={cn(
                  "h-auto w-full justify-start gap-3 rounded-lg p-3 text-left transition-colors active:scale-100",
                  moveToProfileId === p._id
                    ? "bg-surface-tertiary text-foreground hover:bg-surface-tertiary"
                    : "bg-surface-secondary hover:bg-surface-tertiary/50",
                )}
              >
                <ProfileAvatar
                  icon={p.icon}
                  color={p.color}
                  className="h-6 w-6 rounded"
                  iconClassName="h-3.5 w-3.5"
                />
                <div>
                  <p className="text-sm font-medium">Move to {p.name}</p>
                  <p className="text-xs text-muted">
                    Transfer all memories to this profile
                  </p>
                </div>
                {moveToProfileId === p._id && (
                  <IconCheck className="h-4 w-4 ml-auto" />
                )}
              </Button>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting && (
              <IconLoader2 size={16} className="mr-2 animate-spin" />
            )}
            Delete Profile
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DefaultProfilesSection({ profiles }: { profiles: Profile[] }) {
  const settings = useQuery(api.userSettings.get);
  const setDefaultProfile = useMutation(
    api.userSettings.setDefaultProfile,
  ).withOptimisticUpdate((localStore, args) => {
    const current = localStore.getQuery(api.userSettings.get, {});
    if (!current) return;
    const defaults = current.defaultProfiles ?? {};
    localStore.setQuery(
      api.userSettings.get,
      {},
      {
        ...current,
        defaultProfiles: { ...defaults, [args.source]: args.profileId },
      },
    );
  });

  const extensionDefaultId = settings?.defaultProfiles?.extension ?? null;

  const defaultProfile = profiles.find((p) => p.isDefault);
  const extensionDefault =
    profiles.find((p) => p._id === extensionDefaultId) ?? defaultProfile;

  const handleDefaultProfileChange = async (profileId: Profile["_id"]) => {
    try {
      await setDefaultProfile({
        source: "extension",
        profileId,
      });
      toast.success("Saved!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    }
  };

  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-base font-medium text-foreground text-balance">
          Default Profiles
        </h3>
        <p className="mt-0.5 text-xs text-muted">
          Choose which profile new memories are saved to by default. In the web
          app, memories save to the active workspace.
        </p>
      </div>

      <Card className="shadow-none">
        <CardContent className="space-y-4 p-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <IconBrandChrome className="h-4 w-4 text-muted" />
                <Label className="text-sm">Browser Extension</Label>
              </div>
              <Select
                value={extensionDefault?._id ?? ""}
                onValueChange={(value) => {
                  const profile = profiles.find((p) => p._id === value);
                  if (profile) void handleDefaultProfileChange(profile._id);
                }}
              >
                <SelectTrigger className="w-[160px]">
                  <SelectValue>
                    {extensionDefault && (
                      <div className="flex items-center gap-2">
                        <div
                          className="h-2 w-2 rounded-full shrink-0"
                          style={{ backgroundColor: extensionDefault.color }}
                        />
                        <span className="truncate">
                          {extensionDefault.name}
                        </span>
                      </div>
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {profiles.map((profile) => (
                    <SelectItem key={profile._id} value={profile._id}>
                      <div className="flex items-center gap-2">
                        <div
                          className="h-2 w-2 rounded-full shrink-0"
                          style={{ backgroundColor: profile.color }}
                        />
                        <span>{profile.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <p className="text-xs text-muted pt-1">
              MCP clients will ask which profile to save to
            </p>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

function ProfilesPage() {
  const profiles = useQuery(api.profiles.list);
  const createProfile = useMutation(api.profiles.create).withOptimisticUpdate(
    (localStore, args) => {
      const list = localStore.getQuery(api.profiles.list, {});
      if (!list) return;
      const first = list.at(0);
      if (!first) return;
      const now = Date.now();
      const tempId = optimisticId("profiles");
      localStore.setQuery(api.profiles.list, {}, [
        ...list,
        {
          _id: tempId,
          _creationTime: now,
          userId: first.userId,
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
          <DeleteProfileDialog
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
