import { api, type Id } from "@vmem/backend";
import { PROFILE_COLORS } from "@vmem/shared";
import { Button } from "@vvedantb/native-ui/button";
import {
  ScreenContainer,
  SettingsField,
  SettingsSection,
  StackPageHeader,
} from "@vvedantb/native-ui/layout";
import {
  ColorSwatches,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  ListRow,
  Select,
  Skeleton,
  Text,
} from "@vvedantb/native-ui/primitives";
import { palette } from "@vvedantb/native-ui/theme";
import { toast } from "@vvedantb/native-ui/toast";
import { useAction, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { convexErrorMessage } from "@/lib/convex-error";
import { getProfileIcon, PROFILE_ICON_OPTIONS } from "@/settings/profile-icon";
import { TabScreen } from "@/ui/TabScreen";
import { useScheme } from "@/ui/theme";

type Profile = FunctionReturnType<typeof api.profiles.list>[number];
type ProfileId = Id<"profiles">;
type Dialogue =
  | { kind: "create" }
  | { kind: "edit"; profile: Profile }
  | { kind: "delete"; profile: Profile }
  | null;

const DEFAULT_COLOR: string = PROFILE_COLORS[0];

function profileOptions(profiles: Profile[]) {
  return profiles.map((profile) => ({
    label: profile.name,
    value: profile._id,
    color: profile.color,
  }));
}

/** Create or edit form. It mounts when the dialog opens, so state starts fresh. */
function ProfileFormDialog({
  profile,
  onClose,
}: {
  profile: Profile | null;
  onClose: () => void;
}) {
  const create = useMutation(api.profiles.create);
  const update = useMutation(api.profiles.update);
  const [name, setName] = useState(profile?.name ?? "");
  const [color, setColor] = useState(profile?.color ?? DEFAULT_COLOR);
  const [icon, setIcon] = useState(profile?.icon ?? "user");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scheme = useScheme();

  const submit = async () => {
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      setError("Name is required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (profile === null) {
        await create({ name: trimmed, color, icon });
      } else {
        await update({ profileId: profile._id, name: trimmed, color, icon });
      }
    } catch (err) {
      setError(convexErrorMessage(err, "Failed to save profile"));
      setSaving(false);
      return;
    }
    onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {profile === null ? "Create profile" : "Edit profile"}
          </DialogTitle>
          <DialogDescription>
            {profile === null
              ? "Create a new profile to organise your memories."
              : "Update your profile settings."}
          </DialogDescription>
        </DialogHeader>
        <View className="gap-4">
          <SettingsField label="Name">
            <Input
              value={name}
              onChangeText={setName}
              placeholder="e.g. Work, Personal, Study"
              accessibilityLabel="Name"
            />
          </SettingsField>
          <SettingsField label="Colour">
            <ColorSwatches
              value={color}
              onChange={setColor}
              colors={[...PROFILE_COLORS]}
              accessibilityLabel="Colour"
            />
          </SettingsField>
          <SettingsField label="Icon">
            <Select
              value={icon}
              options={PROFILE_ICON_OPTIONS}
              onValueChange={setIcon}
              accessibilityLabel="Icon"
            />
          </SettingsField>
          {error !== null ? (
            <Text style={{ color: palette.danger[scheme] }}>{error}</Text>
          ) : null}
        </View>
        <DialogFooter>
          <Button variant="outline" onPress={onClose}>
            Cancel
          </Button>
          <Button loading={saving} onPress={() => void submit()}>
            {profile === null ? "Create profile" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Delete the profile and delete or move its memories (as web ProfileDangerZone). */
function DeleteProfileDialog({
  profile,
  profiles,
  onClose,
}: {
  profile: Profile;
  profiles: Profile[];
  onClose: () => void;
}) {
  const remove = useAction(api.profiles.removeWithMemories);
  const [moveTo, setMoveTo] = useState<ProfileId | null>(null);
  const [deleting, setDeleting] = useState(false);
  const others = profiles.filter((p) => p._id !== profile._id);

  const submit = async () => {
    setDeleting(true);
    try {
      await remove({
        profileId: profile._id,
        moveMemoriesToProfileId: moveTo ?? undefined,
      });
    } catch (err) {
      toast.error(convexErrorMessage(err, "Failed to delete profile"));
      setDeleting(false);
      return;
    }
    toast.success(`Deleted ${profile.name}`);
    onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete profile</DialogTitle>
          <DialogDescription>
            {`Delete "${profile.name}"? This cannot be undone. Choose what happens to the memories in this profile.`}
          </DialogDescription>
        </DialogHeader>
        <Select<ProfileId | null>
          value={moveTo}
          options={[
            { label: "Delete all memories", value: null },
            ...others.map((p) => ({
              label: `Move memories to ${p.name}`,
              value: p._id,
              color: p.color,
            })),
          ]}
          onValueChange={setMoveTo}
          accessibilityLabel="What happens to the memories"
        />
        <DialogFooter>
          <Button variant="outline" onPress={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            loading={deleting}
            onPress={() => void submit()}
          >
            Delete profile
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DefaultProfilesSection({ profiles }: { profiles: Profile[] }) {
  const settings = useQuery(api.userSettings.get);
  const setDefault = useMutation(api.userSettings.setDefaultProfile);
  const extensionId = settings?.defaultProfiles?.extension ?? null;
  const current =
    profiles.find((p) => p._id === extensionId) ??
    profiles.find((p) => p.isDefault);

  const choose = async (profileId: ProfileId) => {
    try {
      await setDefault({ source: "extension", profileId });
    } catch (err) {
      toast.error(convexErrorMessage(err, "Failed to save"));
      return;
    }
    toast.success("Saved");
  };

  return (
    <SettingsSection
      title="Default profiles"
      description="Choose which profile new memories are saved to by default."
    >
      <SettingsField
        label="Browser extension"
        description="Memories captured by the browser extension save to this profile."
      >
        <Select
          value={current?._id}
          options={profileOptions(profiles)}
          onValueChange={(id) => void choose(id)}
          placeholder="Choose a profile"
          accessibilityLabel="Browser extension default profile"
        />
      </SettingsField>
    </SettingsSection>
  );
}

export default function ProfilesScreen() {
  const profiles = useQuery(api.profiles.list);
  const me = useQuery(api.users.getMe);
  const router = useRouter();
  const [dialogue, setDialogue] = useState<Dialogue>(null);
  const close = () => setDialogue(null);

  return (
    <TabScreen>
      <StackPageHeader title="Profiles" onBack={router.back} />
      <ScreenContainer reserveTabBar>
        {profiles === undefined ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          <>
            <DefaultProfilesSection profiles={profiles} />
            <SettingsSection
              title="Workspaces"
              description="Each profile is a separate memory workspace."
              bodyVariant="list"
              action={
                <Button
                  size="sm"
                  fullWidth={false}
                  onPress={() => setDialogue({ kind: "create" })}
                >
                  New
                </Button>
              }
            >
              {profiles.map((profile) => {
                const isTeam = profile.teamId !== undefined;
                const canEdit = !isTeam || profile.userId === me?._id;
                const canDelete = !isTeam && !profile.isDefault;
                const Icon = getProfileIcon(profile.icon);
                return (
                  <ListRow
                    key={profile._id}
                    title={profile.name}
                    meta={
                      profile.isDefault
                        ? "Default"
                        : isTeam
                          ? "Team"
                          : undefined
                    }
                    leading={<Icon size={20} color={profile.color} />}
                    onPress={
                      canEdit
                        ? () => setDialogue({ kind: "edit", profile })
                        : undefined
                    }
                    control={
                      canDelete ? (
                        <Button
                          size="sm"
                          variant="outline"
                          fullWidth={false}
                          onPress={() =>
                            setDialogue({ kind: "delete", profile })
                          }
                        >
                          Delete
                        </Button>
                      ) : undefined
                    }
                  />
                );
              })}
            </SettingsSection>
          </>
        )}
      </ScreenContainer>

      {dialogue?.kind === "create" ? (
        <ProfileFormDialog profile={null} onClose={close} />
      ) : null}
      {dialogue?.kind === "edit" ? (
        <ProfileFormDialog
          key={dialogue.profile._id}
          profile={dialogue.profile}
          onClose={close}
        />
      ) : null}
      {dialogue?.kind === "delete" && profiles !== undefined ? (
        <DeleteProfileDialog
          key={dialogue.profile._id}
          profile={dialogue.profile}
          profiles={profiles}
          onClose={close}
        />
      ) : null}
    </TabScreen>
  );
}
