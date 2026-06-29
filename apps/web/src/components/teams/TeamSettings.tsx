import { useState } from "react";
import { useAction, useMutation } from "convex/react";
import { useNavigate } from "@tanstack/react-router";
import { api } from "@vmem/backend";
import { Button, Card, CardContent, Input } from "@vmem/ui";
import { IconTrash, IconLoader2 } from "@tabler/icons-react";
import { toast } from "sonner";
import type { TeamDetail } from "./team-detail";

export function TeamSettings({ data }: { data: TeamDetail }) {
  const updateTeam = useMutation(api.teams.updateTeam).withOptimisticUpdate(
    (localStore, args) => {
      const list = localStore.getQuery(api.teams.list, {});
      if (list) {
        localStore.setQuery(
          api.teams.list,
          {},
          list.map((entry) =>
            entry.team._id === args.teamId
              ? {
                  ...entry,
                  team: {
                    ...entry.team,
                    name: args.name,
                    updatedAt: Date.now(),
                  },
                  profile:
                    entry.profile !== null
                      ? {
                          ...entry.profile,
                          name: args.name,
                          updatedAt: Date.now(),
                        }
                      : null,
                }
              : entry,
          ),
        );
      }
      const detail = localStore.getQuery(api.teams.get, {
        teamId: args.teamId,
      });
      if (detail) {
        localStore.setQuery(
          api.teams.get,
          { teamId: args.teamId },
          {
            ...detail,
            team: { ...detail.team, name: args.name, updatedAt: Date.now() },
            profile:
              detail.profile !== null
                ? {
                    ...detail.profile,
                    name: args.name,
                    updatedAt: Date.now(),
                  }
                : null,
          },
        );
      }
    },
  );
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
      // The team workspace just ceased to exist — /home resolves a
      // personal workspace to land in.
      await navigate({ to: "/home" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="shadow-none">
        <CardContent className="space-y-4 p-6">
          <div>
            <h3 className="text-base font-medium text-foreground text-balance">
              Team name
            </h3>
            <p className="mt-1 text-sm text-muted">
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
                <IconLoader2 size={14} className="mr-1.5 animate-spin" />
              ) : null}
              Save
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-none">
        <CardContent className="space-y-4 p-6">
          <div>
            <h3 className="text-base font-medium text-danger text-balance">
              Danger zone
            </h3>
            <p className="mt-1 text-sm text-muted">
              Deleting a team removes the shared profile and all team memories
              for every member. This cannot be undone.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={handleDelete}
            disabled={deleting}
            className="text-danger hover:text-danger"
          >
            {deleting ? (
              <IconLoader2 size={14} className="mr-1.5 animate-spin" />
            ) : (
              <IconTrash size={14} className="mr-1.5" />
            )}
            Delete team
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
