"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@vmem/backend";
import { Button } from "@vmem/ui";
import { IconApps, IconPlus } from "@tabler/icons-react";
import { SystemSkillCard } from "@/components/skills/SystemSkillCard";
import { SystemSkillFormDialog } from "@/components/skills/SystemSkillFormDialog";

type SystemSkillEntry = FunctionReturnType<
  typeof api.systemSkills.listCatalog
>[number];

interface SkillsHubProps {
  profileId: string;
}

/**
 * The Skills Hub — browse maintainer-curated system skills. Each card links to
 * the skill's detail page (read + install/manage there). Admins create new
 * catalog entries here. Installs are LINKS to the catalog, never copies.
 */
export function SkillsHub({ profileId }: SkillsHubProps) {
  const catalog = useQuery(api.systemSkills.listCatalog, {});
  const isAdmin = useQuery(api.systemSkills.amIAdmin, {}) ?? false;
  const [creating, setCreating] = useState(false);

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

  return (
    <div className="space-y-6">
      {isAdmin ? (
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => setCreating(true)}
          >
            <IconPlus size={16} />
            New system skill
          </Button>
        </div>
      ) : null}

      {catalog === undefined ? (
        <div className="flex justify-center py-20">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-default border-t-transparent" />
        </div>
      ) : catalog.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <IconApps size={40} className="mb-3 text-muted" />
          <p className="text-sm text-muted">No system skills available yet.</p>
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
                  profileId={profileId}
                />
              ))}
            </div>
          </section>
        ))
      )}

      <SystemSkillFormDialog open={creating} onOpenChange={setCreating} />
    </div>
  );
}
