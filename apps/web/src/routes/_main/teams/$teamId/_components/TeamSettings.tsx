import { useState } from "react";
import { useAction, useMutation } from "convex/react";
import { useNavigate } from "@tanstack/react-router";
import { api } from "@vmem/backend";
import { Button, Input } from "@vmem/ui";
import { IconTrash, IconLoader2 } from "@tabler/icons-react";
import { toast } from "sonner";
import type { TeamDetail } from "../index";

export function TeamSettings({ data }: { data: TeamDetail }) {
  const updateTeam = useMutation(api.teams.updateTeam);
  const deleteTeam = useAction(api.teams.deleteTeam);
  const navigate = useNavigate();
  const [name, setName] = useState(data.team.name);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const canSave =
    name.trim().length > 0 && name.trim() !== data.team.name && !saving;

  const handleRename = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await updateTeam({ teamId: data.team._id, name: name.trim() });
      toast.success("Team renamed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Rename failed");
    } finally {
      setSaving(false);
    }
  };

  // Double-confirm to delete. The action cascades: team profile, all memberships,
  // and the team's memories in Neo4j. Owner must type the team name to proceed.
  const handleDelete = async () => {
    const typed = window.prompt(
      `Type "${data.team.name}" to confirm deletion. This removes the team profile and all team memories.`,
    );
    if (typed?.trim() !== data.team.name) return;
    const again = window.confirm(
      "Are you absolutely sure? This cannot be undone.",
    );
    if (!again) return;

    setDeleting(true);
    try {
      await deleteTeam({ teamId: data.team._id });
      toast.success(`Deleted ${data.team.name}`);
      await navigate({ to: "/teams" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-8 max-w-xl">
      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-medium text-foreground">Team name</h3>
          <p className="text-xs text-muted-foreground">
            Renaming the team also updates the shared profile name.
          </p>
        </div>
        <div className="flex gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1"
          />
          <Button onClick={handleRename} disabled={!canSave}>
            {saving ? (
              <IconLoader2 size={14} className="animate-spin mr-1.5" />
            ) : null}
            Save
          </Button>
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-medium text-destructive">Danger zone</h3>
          <p className="text-xs text-muted-foreground">
            Deleting a team removes the shared profile and all team memories for
            every member. This cannot be undone.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={handleDelete}
          disabled={deleting}
          className="text-destructive hover:text-destructive"
        >
          {deleting ? (
            <IconLoader2 size={14} className="mr-1.5 animate-spin" />
          ) : (
            <IconTrash size={14} className="mr-1.5" />
          )}
          Delete team
        </Button>
      </section>
    </div>
  );
}
