"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@vmem/backend";
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@vmem/ui";
import { IconApps, IconPlus } from "@tabler/icons-react";
import { toast } from "sonner";
import { SystemSkillCard } from "@/components/skills/SystemSkillCard";
import { SystemSkillFormDialog } from "@/components/skills/SystemSkillFormDialog";
import { ViewSkillPanel } from "@/components/skills/ViewSkillPanel";

type SystemSkillEntry = FunctionReturnType<
  typeof api.systemSkills.listCatalog
>[number];

type FormState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; entry: SystemSkillEntry };

/**
 * The Skills Hub — browse and install maintainer-curated system skills.
 * Installs are LINKS to the catalog, so the user can enable/disable/remove
 * but never forks the instructions. Admins (users.isAdmin) also create/edit.
 */
export function SkillsHub() {
  const catalog = useQuery(api.systemSkills.listCatalog, {});
  const isAdmin = useQuery(api.systemSkills.amIAdmin, {}) ?? false;

  const install = useMutation(api.systemSkills.install).withOptimisticUpdate(
    (store, args) => {
      const current = store.getQuery(api.systemSkills.listCatalog, {});
      if (!current) return;
      store.setQuery(
        api.systemSkills.listCatalog,
        {},
        current.map((e) =>
          e._id === args.systemSkillId
            ? { ...e, installed: true, installEnabled: true }
            : e,
        ),
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
      current.map((e) =>
        e._id === args.systemSkillId
          ? { ...e, installed: false, installEnabled: false }
          : e,
      ),
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
      current.map((e) =>
        e._id === args.systemSkillId
          ? { ...e, installEnabled: args.enabled }
          : e,
      ),
    );
  });
  const adminDelete = useMutation(api.systemSkills.adminDelete);

  const [form, setForm] = useState<FormState>({ mode: "closed" });
  const [viewing, setViewing] = useState<SystemSkillEntry | null>(null);
  const [deleting, setDeleting] = useState<SystemSkillEntry | null>(null);

  // Group by category for a scannable catalog; uncategorised falls under "Other".
  const grouped = useMemo(() => {
    const cats = new Map<string, SystemSkillEntry[]>();
    for (const entry of catalog ?? []) {
      const key = entry.category ?? "Other";
      const list = cats.get(key) ?? [];
      list.push(entry);
      cats.set(key, list);
    }
    return [...cats.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [catalog]);

  const run = async (fn: () => Promise<unknown>, failMessage: string) => {
    try {
      await fn();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : failMessage);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    const id = deleting._id;
    setDeleting(null);
    await run(() => adminDelete({ id }), "Failed to delete");
    toast.success("System skill deleted");
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto scrollbar-thin px-1 pb-4">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4">
        {isAdmin ? (
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setForm({ mode: "create" })}
            >
              <IconPlus size={16} />
              New system skill
            </Button>
          </div>
        ) : null}

        {catalog === undefined ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-default border-t-transparent" />
          </div>
        ) : catalog.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <IconApps size={40} className="mb-3 text-muted" />
            <p className="text-sm text-muted">
              No system skills available yet.
            </p>
          </div>
        ) : (
          grouped.map(([category, entries]) => (
            <section key={category} className="space-y-2">
              <h2 className="text-xs font-medium uppercase tracking-wide text-muted">
                {category}
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {entries.map((entry) => (
                  <SystemSkillCard
                    key={entry._id}
                    entry={entry}
                    isAdmin={isAdmin}
                    onView={() => setViewing(entry)}
                    onInstall={() =>
                      void run(
                        () => install({ systemSkillId: entry._id }),
                        "Failed to add",
                      )
                    }
                    onUninstall={() =>
                      void run(
                        () => uninstall({ systemSkillId: entry._id }),
                        "Failed to remove",
                      )
                    }
                    onToggleEnabled={(enabled) =>
                      void run(
                        () => setEnabled({ systemSkillId: entry._id, enabled }),
                        "Failed to update",
                      )
                    }
                    onEdit={() => setForm({ mode: "edit", entry })}
                    onDelete={() => setDeleting(entry)}
                  />
                ))}
              </div>
            </section>
          ))
        )}
      </div>

      <SystemSkillFormDialog
        open={form.mode !== "closed"}
        entry={form.mode === "edit" ? form.entry : undefined}
        onOpenChange={(open) => {
          if (!open) setForm({ mode: "closed" });
        }}
      />

      <Dialog
        open={viewing !== null}
        onOpenChange={(open) => {
          if (!open) setViewing(null);
        }}
      >
        <DialogContent className="flex max-h-[80vh] flex-col sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{viewing?.name}</DialogTitle>
          </DialogHeader>
          {viewing ? <ViewSkillPanel skill={viewing} /> : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete system skill?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted">
            “{deleting?.name}” will be removed from the catalog and uninstalled
            for everyone who added it.
          </p>
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeleting(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => void handleDelete()}
            >
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
