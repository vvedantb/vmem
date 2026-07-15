"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Link, useNavigate } from "@tanstack/react-router";
import { api } from "@vmem/backend";
import {
  Breadcrumb,
  BreadcrumbLink,
  BreadcrumbPage,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Switch,
} from "@vmem/ui";
import { IconDots, IconPencil, IconPlus, IconTrash } from "@tabler/icons-react";
import { toast } from "sonner";
import PageContainer from "@/components/PageContainer";
import { ViewSkillPanel } from "@/components/skills/ViewSkillPanel";
import { SystemSkillFormDialog } from "@/components/skills/SystemSkillFormDialog";
import DestructiveConfirmDialog from "@/components/settings/DestructiveConfirmDialog";
import {
  patchSystemSkillCatalog,
  type SystemSkillEntry,
} from "@/components/skills/_utils";
import { useActiveTeamId } from "@/components/workspace/active-profile";

const systemSkillDetailSpinner = (
  <div className="flex justify-center py-20">
    <div className="h-5 w-5 animate-spin rounded-full border-2 border-default border-t-transparent" />
  </div>
);

interface SystemSkillDetailActionsProps {
  entry: SystemSkillEntry;
  isAdmin: boolean;
  onInstall: () => void;
  onSetEnabled: (enabled: boolean) => void;
  onUninstall: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function SystemSkillDetailActions({
  entry,
  isAdmin,
  onInstall,
  onSetEnabled,
  onUninstall,
  onEdit,
  onDelete,
}: SystemSkillDetailActionsProps) {
  const showMenu = entry.installed || isAdmin;

  return (
    <div className="flex items-center gap-1.5">
      {entry.installed ? null : (
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={onInstall}
        >
          <IconPlus size={16} />
          Add
        </Button>
      )}
      {showMenu ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="shrink-0 text-muted"
              aria-label="Skill actions"
            >
              <IconDots size={16} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {entry.installed ? (
              <>
                <DropdownMenuItem
                  className="flex items-center justify-between gap-4"
                  onSelect={(e) => e.preventDefault()}
                >
                  <span>Enabled</span>
                  <Switch
                    checked={entry.installEnabled}
                    onCheckedChange={onSetEnabled}
                    aria-label={
                      entry.installEnabled ? "Disable skill" : "Enable skill"
                    }
                    onClick={(e) => e.stopPropagation()}
                  />
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-danger focus:text-danger data-[highlighted]:text-danger"
                  onSelect={onUninstall}
                >
                  <IconTrash size={14} />
                  Remove
                </DropdownMenuItem>
              </>
            ) : null}
            {isAdmin ? (
              <>
                {entry.installed ? <DropdownMenuSeparator /> : null}
                <DropdownMenuItem onSelect={onEdit}>
                  <IconPencil size={14} />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-danger focus:text-danger data-[highlighted]:text-danger"
                  onSelect={onDelete}
                >
                  <IconTrash size={14} />
                  Delete
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}

interface SystemSkillDetailProps {
  systemSkillId: string;
  profileId: string;
}

// read-only detail page for a catalog system skill
export function SystemSkillDetail({
  systemSkillId,
  profileId,
}: SystemSkillDetailProps) {
  const navigate = useNavigate();
  const teamId = useActiveTeamId();
  const catalogArgs = { teamId };
  const catalog = useQuery(api.systemSkills.listCatalog, catalogArgs);
  const isAdmin = useQuery(api.systemSkills.amIAdmin, {}) ?? false;

  const install = useMutation(api.systemSkills.install).withOptimisticUpdate(
    (store, args) => {
      const current = store.getQuery(api.systemSkills.listCatalog, catalogArgs);
      if (!current) return;
      store.setQuery(
        api.systemSkills.listCatalog,
        catalogArgs,
        patchSystemSkillCatalog(current, args.systemSkillId, {
          installed: true,
          installEnabled: true,
        }),
      );
    },
  );
  const uninstall = useMutation(
    api.systemSkills.uninstall,
  ).withOptimisticUpdate((store, args) => {
    const current = store.getQuery(api.systemSkills.listCatalog, catalogArgs);
    if (!current) return;
    store.setQuery(
      api.systemSkills.listCatalog,
      catalogArgs,
      patchSystemSkillCatalog(current, args.systemSkillId, {
        installed: false,
        installEnabled: false,
      }),
    );
  });
  const setEnabled = useMutation(
    api.systemSkills.setInstalledEnabled,
  ).withOptimisticUpdate((store, args) => {
    const current = store.getQuery(api.systemSkills.listCatalog, catalogArgs);
    if (!current) return;
    store.setQuery(
      api.systemSkills.listCatalog,
      catalogArgs,
      patchSystemSkillCatalog(current, args.systemSkillId, {
        installEnabled: args.enabled,
      }),
    );
  });
  const adminDelete = useMutation(api.systemSkills.adminDelete);

  const [editing, setEditing] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const entry = catalog?.find((e) => e._id === systemSkillId);

  const backToHub = () =>
    navigate({ to: "/$profileId/skills/hub", params: { profileId } });

  if (catalog === undefined) {
    return (
      <PageContainer title="Skill" centeredMaxWidth>
        {systemSkillDetailSpinner}
      </PageContainer>
    );
  }

  if (!entry) {
    return (
      <PageContainer title="Skill not found" centeredMaxWidth showTitle>
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <p className="mb-4 text-sm text-muted">
            This system skill no longer exists.
          </p>
          <Button variant="outline" size="sm" onClick={() => void backToHub()}>
            Back to Skills Hub
          </Button>
        </div>
      </PageContainer>
    );
  }

  const run = async (fn: () => Promise<unknown>, failMessage: string) => {
    try {
      await fn();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : failMessage);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await adminDelete({ id: entry._id });
      toast.success(`Deleted ${entry.name}`);
      setDeleteOpen(false);
      void backToHub();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <PageContainer
      title={entry.name}
      noScroll
      centeredMaxWidth
      breadcrumb={
        <Breadcrumb>
          <BreadcrumbLink asChild>
            <Link to="/$profileId/skills/hub" params={{ profileId }}>
              Skills Hub
            </Link>
          </BreadcrumbLink>
          <BreadcrumbPage>{entry.name}</BreadcrumbPage>
        </Breadcrumb>
      }
      rightSection={
        <SystemSkillDetailActions
          entry={entry}
          isAdmin={isAdmin}
          onInstall={() =>
            void run(
              () => install({ systemSkillId: entry._id, teamId }),
              "Failed to add",
            )
          }
          onSetEnabled={(enabled) =>
            void run(
              () =>
                setEnabled({
                  systemSkillId: entry._id,
                  enabled,
                  teamId,
                }),
              "Failed to update",
            )
          }
          onUninstall={() =>
            void run(
              () => uninstall({ systemSkillId: entry._id, teamId }),
              "Failed to remove",
            )
          }
          onEdit={() => setEditing(true)}
          onDelete={() => setDeleteOpen(true)}
        />
      }
    >
      <div className="flex h-full min-h-0 flex-1 flex-col">
        <ViewSkillPanel skill={entry} />
      </div>

      <SystemSkillFormDialog
        open={editing}
        entry={entry}
        onOpenChange={setEditing}
      />

      <DestructiveConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete system skill?"
        description={`“${entry.name}” will be removed from the catalog and uninstalled for everyone who added it.`}
        confirmLabel="Delete"
        submittingLabel="Deleting..."
        submitting={deleting}
        onConfirm={() => {
          void handleDelete();
        }}
      />
    </PageContainer>
  );
}
