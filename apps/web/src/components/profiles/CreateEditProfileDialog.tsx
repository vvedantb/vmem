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

/**
 * Create/edit form for a (personal) profile — shared by the settings
 * profiles page and the sidebar workspace switcher. The caller owns the
 * mutation; this component only collects { name, color, icon }.
 */
export function CreateEditProfileDialog({
  profile,
  open,
  onOpenChange,
  onSave,
}: {
  profile: Doc<"profiles"> | null;
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
              {PROFILE_ICON_OPTIONS.map((i) => {
                const IconComponent = i.icon;
                return (
                  <button
                    key={i.name}
                    type="button"
                    onClick={() => setIcon(i.name)}
                    className={cn(
                      "h-9 w-9 rounded-lg flex items-center justify-center transition-colors",
                      icon === i.name
                        ? "bg-segment text-foreground"
                        : "bg-surface-secondary hover:bg-surface-tertiary",
                    )}
                  >
                    <IconComponent className="h-4 w-4" />
                  </button>
                );
              })}
            </div>
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <IconLoader2 size={16} className="mr-2 animate-spin" />}
            {profile ? "Save Changes" : "Create Profile"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
