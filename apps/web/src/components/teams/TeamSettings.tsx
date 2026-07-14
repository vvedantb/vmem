import { useRef, useState } from "react";
import { useAction, useMutation } from "convex/react";
import { useNavigate } from "@tanstack/react-router";
import { api } from "@vmem/backend";
import { Button, Card, CardContent, Input } from "@vmem/ui";
import { IconTrash, IconLoader2 } from "@tabler/icons-react";
import { toast } from "sonner";
import { useTeamDetail } from "./team-context";

export function TeamSettings() {
  const data = useTeamDetail();
  const updateTeam = useMutation(api.teams.updateTeam).withOptimisticUpdate(
    (localStore, args) => {
      const now = Date.now();
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
                    updatedAt: now,
                  },
                  profile:
                    entry.profile !== null
                      ? {
                          ...entry.profile,
                          name: args.name,
                          updatedAt: now,
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
            team: { ...detail.team, name: args.name, updatedAt: now },
            profile:
              detail.profile !== null
                ? {
                    ...detail.profile,
                    name: args.name,
                    updatedAt: now,
                  }
                : null,
          },
        );
      }
    },
  );
  const deleteTeam = useAction(api.teams.deleteTeam);
  const navigate = useNavigate();
  const nameBaselineRef = useRef<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleNameChange = (name: string) => {
    const trimmed = name.trim();
    if (trimmed.length === 0 || trimmed === data.team.name) return;

    void updateTeam({ teamId: data.team._id, name: trimmed }).catch(
      (err: unknown) => {
        toast.error(err instanceof Error ? err.message : "Rename failed");
      },
    );
  };

  // Cascades: team profile, memberships, and Neo4j team memories.
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
          <Input
            value={data.team.name}
            onFocus={() => {
              nameBaselineRef.current = data.team.name;
            }}
            onChange={(e) => handleNameChange(e.target.value)}
            onBlur={() => {
              const baseline = nameBaselineRef.current;
              nameBaselineRef.current = null;
              if (baseline !== null && baseline !== data.team.name) {
                toast.success("Team renamed");
              }
            }}
            className="w-full"
          />
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
