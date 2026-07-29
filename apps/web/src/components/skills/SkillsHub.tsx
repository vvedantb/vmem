import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@vmem/backend";
import { Button, Spinner } from "@vmem/ui";
import { IconApps, IconPlus } from "@tabler/icons-react";
import { SystemSkillCard } from "@/components/skills/SystemSkillCard";
import { SystemSkillFormDialog } from "@/components/skills/SystemSkillFormDialog";
import type { SystemSkillEntry } from "@/components/skills/_utils";
import { useActiveTeamId } from "@/components/workspace/active-profile";

const skillsHubSpinner = (
  <div className="flex justify-center py-20">
    <Spinner size="sm" />
  </div>
);

const skillsHubEmpty = (
  <div className="flex flex-col items-center justify-center py-20 text-center">
    <IconApps size={40} className="mb-3 text-muted" />
    <p className="text-sm text-muted">No system skills available yet.</p>
  </div>
);

function groupCatalogByCategory(
  catalog: SystemSkillEntry[],
): Array<[string, SystemSkillEntry[]]> {
  const categories = new Map<string, SystemSkillEntry[]>();
  for (const entry of catalog) {
    const key = entry.category ?? "Other";
    const list = categories.get(key);
    if (list) {
      list.push(entry);
    } else {
      categories.set(key, [entry]);
    }
  }
  return [...categories.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

interface SkillsHubCatalogProps {
  catalog: SystemSkillEntry[];
  profileId: string;
}

function SkillsHubCatalog({ catalog, profileId }: SkillsHubCatalogProps) {
  const grouped = groupCatalogByCategory(catalog);

  return (
    <>
      {grouped.map(([category, entries]) => (
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
      ))}
    </>
  );
}

interface SkillsHubBodyProps {
  catalog: SystemSkillEntry[] | undefined;
  profileId: string;
}

function SkillsHubBody({ catalog, profileId }: SkillsHubBodyProps) {
  if (catalog === undefined) return skillsHubSpinner;
  if (catalog.length === 0) return skillsHubEmpty;
  return <SkillsHubCatalog catalog={catalog} profileId={profileId} />;
}

interface SkillsHubProps {
  profileId: string;
}

// the Skills Hub browse maintainer curated system skills
export function SkillsHub({ profileId }: SkillsHubProps) {
  const teamId = useActiveTeamId();
  const catalog = useQuery(api.systemSkills.listCatalog, { teamId });
  const isAdmin = useQuery(api.systemSkills.amIAdmin, {}) ?? false;
  const [creating, setCreating] = useState(false);

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

      <SkillsHubBody catalog={catalog} profileId={profileId} />

      <SystemSkillFormDialog open={creating} onOpenChange={setCreating} />
    </div>
  );
}
