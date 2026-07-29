import { useState } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  cn,
} from "@vmem/ui";
import { IconCheck, IconLoader2, IconTrash } from "@tabler/icons-react";
import type { FunctionReturnType } from "convex/server";
import type { api, Id } from "@vmem/backend";
import { ProfileAvatar } from "./ProfileAvatar";

type Profile = FunctionReturnType<typeof api.profiles.list>[number];

export function ProfileDangerZone({
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
    // the reset is duplicated into a rethrowing catch rather than a `finally`
    // react Compiler bails on the whole file for a `finally`, and for a `try`
    // with no `catch` at all.
    try {
      await onDelete(moveToProfileId);
      onOpenChange(false);
    } catch (err) {
      setDeleting(false);
      throw err;
    }
    setDeleting(false);
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
