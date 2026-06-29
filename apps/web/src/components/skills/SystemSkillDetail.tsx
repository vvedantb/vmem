"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Link, useNavigate } from "@tanstack/react-router";
import { api } from "@vmem/backend";
import {
  Breadcrumb,
  BreadcrumbLink,
  BreadcrumbPage,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Switch,
} from "@vmem/ui";
import {
  IconDots,
  IconLoader2,
  IconPencil,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import { toast } from "sonner";
import PageContainer from "@/components/PageContainer";
import { ViewSkillPanel } from "@/components/skills/ViewSkillPanel";
import { SystemSkillFormDialog } from "@/components/skills/SystemSkillFormDialog";

type SystemSkillEntry = FunctionReturnType<
  typeof api.systemSkills.listCatalog
>[number];

interface SystemSkillDetailProps {
  systemSkillId: string;
  profileId: string;
}

/** Patch one entry in the cached catalog (shared optimistic-update helper). */
function patchCatalog(
  rows: SystemSkillEntry[],
  id: string,
  change: Partial<SystemSkillEntry>,
): SystemSkillEntry[] {
  return rows.map((entry) =>
    entry._id === id ? { ...entry, ...change } : entry,
  );
}

/**
 * Read-only detail page for a catalog system skill — full instructions plus
 * install / enable / remove (and admin edit / delete) in the header. Mirrors
 * the personal skill detail + SkillHeaderActions so both behave the same.
 */
export function SystemSkillDetail({
  systemSkillId,
  profileId,
}: SystemSkillDetailProps) {
  const navigate = useNavigate();
  const catalog = useQuery(api.systemSkills.listCatalog, {});
  const isAdmin = useQuery(api.systemSkills.amIAdmin, {}) ?? false;

  const install = useMutation(api.systemSkills.install).withOptimisticUpdate(
    (store, args) => {
      const current = store.getQuery(api.systemSkills.listCatalog, {});
      if (!current) return;
      store.setQuery(
        api.systemSkills.listCatalog,
        {},
        patchCatalog(current, args.systemSkillId, {
          installed: true,
          installEnabled: true,
        }),
      );
    },
  );
  const uninstall = useMutation(
    api.systemSkills.uninstall,
  ).withOptimisticUpdate((store, args) => {
    const current = store.getQuery(api.systemSkills.listCatalog, {});
    if (!current) return;
    store.setQuery(
      api.systemSkills.listCatalog,
      {},
      patchCatalog(current, args.systemSkillId, {
        installed: false,
        installEnabled: false,
      }),
    );
  });
  const setEnabled = useMutation(
    api.systemSkills.setInstalledEnabled,
  ).withOptimisticUpdate((store, args) => {
    const current = store.getQuery(api.systemSkills.listCatalog, {});
    if (!current) return;
    store.setQuery(
      api.systemSkills.listCatalog,
      {},
      patchCatalog(current, args.systemSkillId, {
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
        <div className="flex justify-center py-20">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-default border-t-transparent" />
        </div>
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

  const showMenu = entry.installed || isAdmin;

  const actions = (
    <div className="flex items-center gap-1.5">
      {entry.installed ? null : (
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() =>
            void run(
              () => install({ systemSkillId: entry._id }),
              "Failed to add",
            )
          }
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
                    onCheckedChange={(checked) =>
                      void run(
                        () =>
                          setEnabled({
                            systemSkillId: entry._id,
                            enabled: checked,
                          }),
                        "Failed to update",
                      )
                    }
                    aria-label={
                      entry.installEnabled ? "Disable skill" : "Enable skill"
                    }
                    onClick={(e) => e.stopPropagation()}
                  />
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-danger focus:text-danger data-[highlighted]:text-danger"
                  onSelect={() =>
                    void run(
                      () => uninstall({ systemSkillId: entry._id }),
                      "Failed to remove",
                    )
                  }
                >
                  <IconTrash size={14} />
                  Remove
                </DropdownMenuItem>
              </>
            ) : null}
            {isAdmin ? (
              <>
                {entry.installed ? <DropdownMenuSeparator /> : null}
                <DropdownMenuItem onSelect={() => setEditing(true)}>
                  <IconPencil size={14} />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-danger focus:text-danger data-[highlighted]:text-danger"
                  onSelect={() => setDeleteOpen(true)}
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
      rightSection={actions}
    >
      <div className="flex h-full min-h-0 flex-1 flex-col">
        <ViewSkillPanel skill={entry} />
      </div>

      <SystemSkillFormDialog
        open={editing}
        entry={entry}
        onOpenChange={setEditing}
      />

      <Dialog
        open={deleteOpen}
        onOpenChange={(open) => {
          if (!deleting) setDeleteOpen(open);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete system skill?</DialogTitle>
            <DialogDescription>
              “{entry.name}” will be removed from the catalog and uninstalled
              for everyone who added it.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setDeleteOpen(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void handleDelete()}
              disabled={deleting}
            >
              {deleting ? (
                <IconLoader2 size={14} className="animate-spin" />
              ) : (
                <IconTrash size={14} />
              )}
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
