"use client";

import { Link } from "@tanstack/react-router";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@vmem/backend";
import { Badge, Card, CardContent } from "@vmem/ui";

type SystemSkillEntry = FunctionReturnType<
  typeof api.systemSkills.listCatalog
>[number];

interface SystemSkillCardProps {
  entry: SystemSkillEntry;
  profileId: string;
}

/**
 * A catalog entry in the Skills Hub. The whole card links to the skill's
 * detail page (where it can be read, installed, toggled, removed) — same
 * card-to-detail pattern as CodebaseCard.
 */
export function SystemSkillCard({ entry, profileId }: SystemSkillCardProps) {
  return (
    <Link
      to="/$profileId/skills/system/$skillId"
      params={{ profileId, skillId: entry._id }}
      className="block"
    >
      <Card className="group h-full cursor-pointer shadow-none transition-colors hover:bg-surface-tertiary/50">
        <CardContent className="p-4 sm:p-5">
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-foreground">
                {entry.name}
              </h3>
              {!entry.published ? (
                <Badge variant="outline" className="h-5 text-[10px]">
                  Draft
                </Badge>
              ) : null}
            </div>
            {entry.installed ? (
              <Badge variant="success" className="h-5 shrink-0 text-[10px]">
                Installed
              </Badge>
            ) : null}
          </div>
          <p className="mt-1.5 line-clamp-2 text-xs text-muted">
            {entry.description}
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}
