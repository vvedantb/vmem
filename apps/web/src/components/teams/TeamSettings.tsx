import { useRef, useState } from "react";
import { useAction, useMutation } from "convex/react";
import { useNavigate } from "@tanstack/react-router";
import { api } from "@vmem/backend";
import { Button, Input } from "@vmem/ui";
import { IconAlertTriangle, IconTrash, IconLoader2 } from "@tabler/icons-react";
import { toast } from "sonner";
import { convexErrorMessage } from "@/lib/convex-error";
import { SettingsField } from "@/components/settings/SettingsField";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { useTeamDetail } from "./team-context";
import { DeleteTeamDialog } from "./DeleteTeamDialog";

export function TeamSettings() {
  const data = useTeamDetail();
  const updateTeam = useMutation(api.teams.updateTeam).withOptimisticUpdate(
    (localStore, args) => {
      const detail = localStore.getQuery(api.teams.get, {
        teamId: args.teamId,
      });
      if (detail != null) {
        localStore.setQuery(
          api.teams.get,
          { teamId: args.teamId },
          {
            ...detail,
            team: { ...detail.team, name: args.name },
          },
        );
      }
      const profiles = localStore.getQuery(api.profiles.list, {});
      if (profiles !== undefined) {
        localStore.setQuery(
          api.profiles.list,
          {},
          profiles.map((p) =>
            p.teamId !== undefined && (p.teamId as string) === args.teamId
              ? { ...p, name: args.name }
              : p,
          ),
        );
      }
    },
  );
  const deleteTeam = useAction(api.teams.deleteTeam);
  const navigate = useNavigate();
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const savingNameRef = useRef(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const nameValue = nameDraft ?? data.team.name;

  const saveName = async () => {
    if (savingNameRef.current) return;
    if (nameDraft === null) return;
    const trimmed = nameDraft.trim();
    if (trimmed.length === 0 || trimmed === data.team.name) {
      setNameDraft(null);
      return;
    }
    savingNameRef.current = true;
    try {
      await updateTeam({ teamId: data.team._id, name: trimmed });
      toast.success("Team renamed");
      setNameDraft(null);
    } catch (err) {
      toast.error(convexErrorMessage(err, "Rename failed"));
    }
    savingNameRef.current = false;
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteTeam({ teamId: data.team._id });
      toast.success(`Deleted ${data.team.name}`);
      setDeleteDialogOpen(false);
      await navigate({ to: "/home" });
    } catch (err) {
      toast.error(convexErrorMessage(err, "Delete failed"));
      setDeleting(false);
    }
  };

  return (
    <>
      <SettingsSection
        title="Team name"
        description="Renaming the team also updates the shared profile name."
      >
        <SettingsField htmlFor="team-name" label="Name">
          <Input
            id="team-name"
            value={nameValue}
            onFocus={() => {
              setNameDraft(data.team.name);
            }}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={() => {
              void saveName();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void saveName();
              }
            }}
            className="w-full"
          />
        </SettingsField>
      </SettingsSection>

      <SettingsSection
        title={
          <span className="inline-flex items-center gap-2 text-danger">
            <IconAlertTriangle size={16} stroke={1.75} />
            Danger zone
          </span>
        }
        description="Deleting a team removes the shared profile and all team memories for every member. This cannot be undone."
      >
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
      </SettingsSection>

      <DeleteTeamDialog
        open={deleteDialogOpen}
        teamName={data.team.name}
        submitting={deleting}
        onClose={() => {
          if (!deleting) setDeleteDialogOpen(false);
        }}
        onConfirm={() => void handleDelete()}
      />
    </>
  );
}
