import { useState } from "react";
import { useMutation } from "convex/react";
import { useNavigate } from "@tanstack/react-router";
import { api } from "@vmem/backend";
import type { Id } from "@vmem/backend";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from "@vmem/ui";
import { IconLoader2 } from "@tabler/icons-react";
import { toast } from "sonner";
import { optimisticId } from "@/lib/optimisticId";

interface CreateTeamDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateTeamDialog({
  open,
  onOpenChange,
}: CreateTeamDialogProps) {
  const createTeam = useMutation(api.teams.create).withOptimisticUpdate(
    (localStore, args) => {
      const list = localStore.getQuery(api.teams.list, {});
      if (!list || list.length === 0) return;
      const now = Date.now();
      const teamId = optimisticId("teams");
      const profileId = optimisticId("profiles");
      localStore.setQuery(api.teams.list, {}, [
        {
          team: {
            _id: teamId,
            _creationTime: now,
            name: args.name.trim(),
            createdBy: list[0].team.createdBy,
            createdAt: now,
            updatedAt: now,
          },
          role: "owner",
          profile: {
            _id: profileId,
            _creationTime: now,
            userId: list[0].team.createdBy,
            name: args.name.trim(),
            color: "#8B5CF6",
            icon: "briefcase",
            isDefault: false,
            teamId,
            createdAt: now,
            updatedAt: now,
          },
          memberCount: 1,
        },
        ...list,
      ]);
    },
  );
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const trimmed = name.trim();
  const canSubmit = trimmed.length > 0 && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const { profileId } = await createTeam({ name: trimmed });
      toast.success(`Created ${trimmed}`);
      onOpenChange(false);
      setName("");
      // Navigate into the new team's workspace.
      await navigate({ to: "/$profileId/home", params: { profileId } });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to create team";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (submitting) return;
        onOpenChange(next);
        if (!next) setName("");
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create team</DialogTitle>
          <DialogDescription>
            Teams share a single company-knowledge profile. You&apos;ll be the
            owner and can invite members by email.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted">Team name</label>
          <Input
            autoFocus
            placeholder="Evalucom"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canSubmit) {
                e.preventDefault();
                void handleSubmit();
              }
            }}
          />
        </div>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {submitting ? (
              <IconLoader2 size={14} className="mr-1.5 animate-spin" />
            ) : null}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
