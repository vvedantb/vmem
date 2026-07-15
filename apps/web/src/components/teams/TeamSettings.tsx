import { useRef, useState } from "react";
import { useAction, useMutation } from "convex/react";
import { useNavigate } from "@tanstack/react-router";
import { api } from "@vmem/backend";
import { Button, Card, CardContent, Input } from "@vmem/ui";
import { IconTrash, IconLoader2 } from "@tabler/icons-react";
import { toast } from "sonner";
import { useTeamDetail } from "./team-context";
import { DeleteTeamDialog } from "./DeleteTeamDialog";

export function TeamSettings() {
  const data = useTeamDetail();
  const updateTeam = useMutation(api.teams.updateTeam);
  const deleteTeam = useAction(api.teams.deleteTeam);
  const navigate = useNavigate();
  const focusedNameRef = useRef<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const handleNameChange = (name: string) => {
    const trimmed = name.trim();
    if (trimmed.length === 0 || trimmed === data.team.name) return;

    void updateTeam({ teamId: data.team._id, name: trimmed }).catch(
      (err: unknown) => {
        toast.error(err instanceof Error ? err.message : "Rename failed");
      },
    );
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteTeam({ teamId: data.team._id });
      toast.success(`Deleted ${data.team.name}`);
      setDeleteDialogOpen(false);
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
              focusedNameRef.current = data.team.name;
            }}
            onChange={(e) => handleNameChange(e.target.value)}
            onBlur={() => {
              const focusedName = focusedNameRef.current;
              focusedNameRef.current = null;
              if (focusedName !== null && focusedName !== data.team.name) {
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
            onClick={() => setDeleteDialogOpen(true)}
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

      <DeleteTeamDialog
        open={deleteDialogOpen}
        teamName={data.team.name}
        submitting={deleting}
        onClose={() => {
          if (!deleting) setDeleteDialogOpen(false);
        }}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}
