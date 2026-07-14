"use client";

import { useState } from "react";
import {
  Button,
  Input,
  Label,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  cn,
} from "@vmem/ui";
import { IconLoader2 } from "@tabler/icons-react";
import type { Doc } from "@vmem/backend";
import { PROFILE_COLORS, PROFILE_ICON_OPTIONS } from "./profile-icon";

const DEFAULT_COLOR: string = PROFILE_COLORS[0] ?? "#171717";

type ProfileFormFields = Pick<Doc<"profiles">, "name" | "color" | "icon">;

type ProfileFieldPatch = Partial<ProfileFormFields>;

function CreateProfileFormContent({
  onOpenChange,
  onSave,
}: {
  onOpenChange: (open: boolean) => void;
  onSave: (data: ProfileFormFields) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(DEFAULT_COLOR);
  const [icon, setIcon] = useState("user");
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
    <>
      <DialogHeader>
        <DialogTitle>Create Profile</DialogTitle>
        <DialogDescription>
          Create a new profile to organize your memories
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
              <Button
                key={c}
                type="button"
                variant="ghost"
                onClick={() => setColor(c)}
                aria-label={`Color ${c}`}
                className={cn(
                  "h-8 w-8 rounded-full p-0 transition-transform",
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
            {PROFILE_ICON_OPTIONS.map((i) => {
              const IconComponent = i.icon;
              return (
                <Button
                  key={i.name}
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setIcon(i.name)}
                  aria-label={i.name}
                  className={cn(
                    "h-9 w-9 rounded-lg",
                    icon === i.name
                      ? "bg-segment text-foreground"
                      : "bg-surface-secondary hover:bg-surface-tertiary",
                  )}
                >
                  <IconComponent className="h-4 w-4" />
                </Button>
              );
            })}
          </div>
        </div>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <IconLoader2 size={16} className="mr-2 animate-spin" />
          ) : null}
          Create Profile
        </Button>
      </DialogFooter>
    </>
  );
}

function EditProfileFormContent({
  profile,
  onOpenChange,
  onFieldUpdate,
}: {
  profile: Doc<"profiles">;
  onOpenChange: (open: boolean) => void;
  onFieldUpdate: (patch: ProfileFieldPatch) => void;
}) {
  const [error, setError] = useState<string | null>(null);

  const handleNameChange = (value: string) => {
    if (!value.trim()) {
      setError("Name is required");
      return;
    }
    setError(null);
    onFieldUpdate({ name: value.trim() });
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit Profile</DialogTitle>
        <DialogDescription>Update your profile settings</DialogDescription>
      </DialogHeader>
      <div className="space-y-4 py-4">
        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            value={profile.name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="e.g. Work, Personal, Study"
          />
        </div>
        <div className="space-y-2">
          <Label>Color</Label>
          <div className="flex flex-wrap gap-2">
            {PROFILE_COLORS.map((c) => (
              <Button
                key={c}
                type="button"
                variant="ghost"
                onClick={() => onFieldUpdate({ color: c })}
                aria-label={`Color ${c}`}
                className={cn(
                  "h-8 w-8 rounded-full p-0 transition-transform",
                  profile.color === c &&
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
            {PROFILE_ICON_OPTIONS.map((i) => {
              const IconComponent = i.icon;
              return (
                <Button
                  key={i.name}
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => onFieldUpdate({ icon: i.name })}
                  aria-label={i.name}
                  className={cn(
                    "h-9 w-9 rounded-lg",
                    profile.icon === i.name
                      ? "bg-segment text-foreground"
                      : "bg-surface-secondary hover:bg-surface-tertiary",
                  )}
                >
                  <IconComponent className="h-4 w-4" />
                </Button>
              );
            })}
          </div>
        </div>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
      </div>
      <DialogFooter>
        <Button onClick={() => onOpenChange(false)}>Done</Button>
      </DialogFooter>
    </>
  );
}

type CreateEditProfileDialogProps =
  | {
      profile: null;
      open: boolean;
      onOpenChange: (open: boolean) => void;
      onSave: (data: ProfileFormFields) => Promise<void>;
    }
  | {
      profile: Doc<"profiles">;
      open: boolean;
      onOpenChange: (open: boolean) => void;
      onFieldUpdate: (patch: ProfileFieldPatch) => void;
    };

// create/edit form for a (personal) profile
export function CreateEditProfileDialog(props: CreateEditProfileDialogProps) {
  const { profile, open, onOpenChange } = props;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {open && profile ? (
          <EditProfileFormContent
            key={profile._id}
            profile={profile}
            onOpenChange={onOpenChange}
            onFieldUpdate={props.onFieldUpdate}
          />
        ) : null}
        {open && !profile ? (
          <CreateProfileFormContent
            onOpenChange={onOpenChange}
            onSave={props.onSave}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
