import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useAction } from "convex/react";
import { useState } from "react";
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
import { api } from "@vmem/backend";
import type { Doc, Id } from "@vmem/backend";
import { optimisticId } from "@/lib/optimisticId";
import PageContainer from "@/components/PageContainer";
import { getProfileIcon } from "@/components/profiles/profile-icon";
import { CreateEditProfileDialog } from "@/components/profiles/CreateEditProfileDialog";

export const Route = createFileRoute("/_main/settings/profiles")({
  component: ProfilesPage,
});

type Profile = Doc<"profiles">;

function ProfileCard({
  profile,
  onEdit,
  onDelete,
}: {
  profile: Profile;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const Icon = getProfileIcon(profile.icon);

  return (
    <Card className="relative shadow-none">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-lg"
            style={{ backgroundColor: profile.color + "20" }}
          >
            <Icon className="h-5 w-5" style={{ color: profile.color }} />
          </div>
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
            <button
              type="button"
              onClick={() => setMoveToProfileId(null)}
              className={cn(
                "w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors",
                moveToProfileId === null
                  ? "bg-surface-tertiary text-foreground"
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
            </button>
            {otherProfiles.map((p) => {
              const Icon = getProfileIcon(p.icon);
              return (
                <button
                  key={p._id}
                  type="button"
                  onClick={() => setMoveToProfileId(p._id)}
                  className={cn(
                    "w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors",
                    moveToProfileId === p._id
                      ? "bg-surface-tertiary text-foreground"
                      : "bg-surface-secondary hover:bg-surface-tertiary/50",
                  )}
                >
                  <div
                    className="h-6 w-6 rounded flex items-center justify-center"
                    style={{ backgroundColor: p.color + "20" }}
                  >
                    <Icon className="h-3.5 w-3.5" style={{ color: p.color }} />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Move to {p.name}</p>
                    <p className="text-xs text-muted">
                      Transfer all memories to this profile
                    </p>
                  </div>
                  {moveToProfileId === p._id && (
                    <IconCheck className="h-4 w-4 ml-auto" />
                  )}
                </button>
              );
            })}
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

  const handleDefaultProfileChange = async (
    source: "extension",
    profileId: string,
  ) => {
    const profile = profiles.find((p) => p._id === profileId);
    if (!profile) return;

    try {
      await setDefaultProfile({
        source,
        profileId: profile._id,
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
                onValueChange={(profileId) => {
                  void handleDefaultProfileChange("extension", profileId);
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
      if (!list || list.length === 0) return;
      const now = Date.now();
      const tempId = optimisticId("profiles");
      localStore.setQuery(api.profiles.list, {}, [
        ...list,
        {
          _id: tempId,
          _creationTime: now,
          userId: list[0].userId,
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
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
  const [deletingProfile, setDeletingProfile] = useState<Profile | null>(null);

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

  const handleCreate = async (data: {
    name: string;
    color: string;
    icon: string;
  }) => {
    await createProfile(data);
  };

  const handleEdit = async (data: {
    name: string;
    color: string;
    icon: string;
  }) => {
    if (!editingProfile) return;
    await updateProfile({
      profileId: editingProfile._id,
      ...data,
    });
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
              onEdit={() => setEditingProfile(profile)}
              onDelete={() => setDeletingProfile(profile)}
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
            onOpenChange={(open) => !open && setEditingProfile(null)}
            onSave={handleEdit}
          />
        )}

        {deletingProfile && (
          <DeleteProfileDialog
            profile={deletingProfile}
            profiles={profiles}
            open={!!deletingProfile}
            onOpenChange={(open) => !open && setDeletingProfile(null)}
            onDelete={handleDelete}
          />
        )}
      </div>
    </PageContainer>
  );
}
