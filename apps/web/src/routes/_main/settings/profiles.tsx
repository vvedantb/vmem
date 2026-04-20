import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useAction } from "convex/react";
import { useState } from "react";
import {
  Button,
  Input,
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
} from "@vmem/ui";
import {
  IconPlus,
  IconEdit,
  IconTrash,
  IconCheck,
  IconUser,
  IconBriefcase,
  IconHome,
  IconCode,
  IconBook,
  IconHeart,
  IconStar,
  IconRocket,
  IconBulb,
  IconMusic,
  IconCamera,
  IconDeviceGamepad,
  IconLoader2,
  IconWorld,
  IconBrandChrome,
} from "@tabler/icons-react";
import { api } from "@vmem/backend";
import type { Doc, Id } from "@vmem/backend";
import PageContainer from "@/components/PageContainer";

export const Route = createFileRoute("/_main/settings/profiles")({
  component: ProfilesPage,
});

const PROFILE_COLORS = [
  "#3B82F6", // blue
  "#10B981", // emerald
  "#F59E0B", // amber
  "#EF4444", // red
  "#8B5CF6", // violet
  "#EC4899", // pink
  "#06B6D4", // cyan
  "#6366F1", // indigo
] as const;

const PROFILE_ICONS = [
  { name: "user", icon: IconUser },
  { name: "briefcase", icon: IconBriefcase },
  { name: "home", icon: IconHome },
  { name: "code", icon: IconCode },
  { name: "book", icon: IconBook },
  { name: "heart", icon: IconHeart },
  { name: "star", icon: IconStar },
  { name: "rocket", icon: IconRocket },
  { name: "lightbulb", icon: IconBulb },
  { name: "music", icon: IconMusic },
  { name: "camera", icon: IconCamera },
  { name: "gamepad", icon: IconDeviceGamepad },
] as const;

function getProfileIcon(iconName: string) {
  const found = PROFILE_ICONS.find((i) => i.name === iconName);
  return found?.icon ?? IconUser;
}

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
    <div className="relative rounded-xl p-4 bg-muted/40">
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
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                Default
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Created{" "}
            {new Date(profile.createdAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/50">
        <Button variant="ghost" size="icon-sm" onClick={onEdit}>
          <IconEdit className="h-4 w-4" />
        </Button>
        {!profile.isDefault && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onDelete}
            className="text-destructive hover:text-destructive"
          >
            <IconTrash className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

function CreateEditProfileDialog({
  profile,
  open,
  onOpenChange,
  onSave,
}: {
  profile: Profile | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: {
    name: string;
    color: string;
    icon: string;
  }) => Promise<void>;
}) {
  const [name, setName] = useState(profile?.name ?? "");
  const [color, setColor] = useState(profile?.color ?? PROFILE_COLORS[0]);
  const [icon, setIcon] = useState(profile?.icon ?? "user");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({ name: name.trim(), color, icon });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save profile");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {profile ? "Edit Profile" : "Create Profile"}
          </DialogTitle>
          <DialogDescription>
            {profile
              ? "Update your profile settings"
              : "Create a new profile to organize your memories"}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Work, Personal, Study"
            />
          </div>
          <div className="space-y-2">
            <Label>Color</Label>
            <div className="flex flex-wrap gap-2">
              {PROFILE_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={cn(
                    "h-8 w-8 rounded-full transition-transform",
                    color === c &&
                      "ring-2 ring-offset-2 ring-offset-background ring-foreground scale-110",
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Icon</Label>
            <div className="flex flex-wrap gap-2">
              {PROFILE_ICONS.map((i) => {
                const IconComponent = i.icon;
                return (
                  <button
                    key={i.name}
                    type="button"
                    onClick={() => setIcon(i.name)}
                    className={cn(
                      "h-9 w-9 rounded-lg flex items-center justify-center transition-colors",
                      icon === i.name
                        ? "bg-accent text-accent-foreground"
                        : "bg-muted hover:bg-accent/50",
                    )}
                  >
                    <IconComponent className="h-4 w-4" />
                  </button>
                );
              })}
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <IconLoader2 className="h-4 w-4 mr-2 animate-spin" />}
            {profile ? "Save Changes" : "Create Profile"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
          <p className="text-sm text-muted-foreground">
            What should happen to the memories in this profile?
          </p>
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setMoveToProfileId(null)}
              className={cn(
                "w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors",
                moveToProfileId === null
                  ? "bg-accent text-accent-foreground"
                  : "bg-muted hover:bg-muted/80",
              )}
            >
              <IconTrash className="h-4 w-4 text-destructive" />
              <div>
                <p className="text-sm font-medium">Delete all memories</p>
                <p className="text-xs text-muted-foreground">
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
                      ? "bg-accent text-accent-foreground"
                      : "bg-muted hover:bg-muted/80",
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
                    <p className="text-xs text-muted-foreground">
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
            {deleting && <IconLoader2 className="h-4 w-4 mr-2 animate-spin" />}
            Delete Profile
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DefaultProfilesSection({ profiles }: { profiles: Profile[] }) {
  const settings = useQuery(api.userSettings.get);
  const setDefaultProfile = useMutation(api.userSettings.setDefaultProfile);

  const webDefaultId = settings?.defaultProfiles?.web ?? null;
  const extensionDefaultId = settings?.defaultProfiles?.extension ?? null;

  const defaultProfile = profiles.find((p) => p.isDefault);
  const webDefault =
    profiles.find((p) => p._id === webDefaultId) ?? defaultProfile;
  const extensionDefault =
    profiles.find((p) => p._id === extensionDefaultId) ?? defaultProfile;

  const handleWebDefaultChange = (profileId: string) => {
    void setDefaultProfile({
      source: "web",
      profileId: profileId as Id<"profiles">,
    });
  };

  const handleExtensionDefaultChange = (profileId: string) => {
    void setDefaultProfile({
      source: "extension",
      profileId: profileId as Id<"profiles">,
    });
  };

  return (
    <div className="rounded-xl bg-muted/40 p-4 space-y-4">
      <div>
        <h3 className="font-medium text-foreground">Default Profiles</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Choose which profile new memories are saved to by default
        </p>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <IconWorld className="h-4 w-4 text-muted-foreground" />
            <Label className="text-sm">Web App</Label>
          </div>
          <Select
            value={webDefault?._id ?? ""}
            onValueChange={handleWebDefaultChange}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue>
                {webDefault && (
                  <div className="flex items-center gap-2">
                    <div
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{ backgroundColor: webDefault.color }}
                    />
                    <span className="truncate">{webDefault.name}</span>
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

        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <IconBrandChrome className="h-4 w-4 text-muted-foreground" />
            <Label className="text-sm">Browser Extension</Label>
          </div>
          <Select
            value={extensionDefault?._id ?? ""}
            onValueChange={handleExtensionDefaultChange}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue>
                {extensionDefault && (
                  <div className="flex items-center gap-2">
                    <div
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{ backgroundColor: extensionDefault.color }}
                    />
                    <span className="truncate">{extensionDefault.name}</span>
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

        <p className="text-xs text-muted-foreground pt-1">
          MCP clients will ask which profile to save to
        </p>
      </div>
    </div>
  );
}

function ProfilesPage() {
  const profiles = useQuery(api.profiles.list);
  const createProfile = useMutation(api.profiles.create);
  const updateProfile = useMutation(api.profiles.update);
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
    <PageContainer title="Profiles" centeredMaxWidth showTitle>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Organize your memories into separate workspaces
          </p>
          <Button onClick={() => setCreateOpen(true)}>
            <IconPlus className="h-4 w-4 mr-2" />
            New Profile
          </Button>
        </div>

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
