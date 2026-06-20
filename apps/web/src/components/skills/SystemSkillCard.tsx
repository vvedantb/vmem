"use client";

import type { FunctionReturnType } from "convex/server";
import { api } from "@vmem/backend";
import { Badge, Button, Switch, cn } from "@vmem/ui";
import {
  IconCheck,
  IconPencil,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";

type SystemSkillEntry = FunctionReturnType<
  typeof api.systemSkills.listCatalog
>[number];

interface SystemSkillCardProps {
  entry: SystemSkillEntry;
  isAdmin: boolean;
  busy?: boolean;
  onView: () => void;
  onInstall: () => void;
  onUninstall: () => void;
  onToggleEnabled: (enabled: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
}

/**
 * One catalog row in the Skills Hub. The body opens a read-only view; the
 * action row installs/removes/toggles the link; admins get edit + delete.
 */
export function SystemSkillCard({
  entry,
  isAdmin,
  busy = false,
  onView,
  onInstall,
  onUninstall,
  onToggleEnabled,
  onEdit,
  onDelete,
}: SystemSkillCardProps) {
  return (
    <div className="flex flex-col gap-3 rounded-lg bg-surface-secondary/40 p-4 transition-[background-color] hover:bg-surface-tertiary/50">
      <button
        type="button"
        onClick={onView}
        className="flex flex-col items-start gap-1.5 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-foreground">
            {entry.name}
          </span>
          {entry.category ? (
            <Badge variant="secondary" className="h-5 text-[10px]">
              {entry.category}
            </Badge>
          ) : null}
          {!entry.published ? (
            <Badge variant="outline" className="h-5 text-[10px]">
              Draft
            </Badge>
          ) : null}
        </div>
        <p className="line-clamp-2 text-xs text-muted">{entry.description}</p>
      </button>

      <div className="flex items-center gap-2">
        {entry.installed ? (
          <>
            <span className="inline-flex items-center gap-1 text-xs text-success">
              <IconCheck size={14} />
              Installed
            </span>
            <Switch
              checked={entry.installEnabled}
              onCheckedChange={onToggleEnabled}
              disabled={busy}
              aria-label={
                entry.installEnabled ? "Disable skill" : "Enable skill"
              }
              className="ml-1"
            />
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-7 px-2 text-xs text-muted"
              onClick={onUninstall}
              disabled={busy}
            >
              Remove
            </Button>
          </>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={onInstall}
            disabled={busy}
          >
            <IconPlus size={14} />
            Add
          </Button>
        )}

        {isAdmin ? (
          <div
            className={cn(
              "flex items-center gap-1",
              entry.installed ? "" : "ml-auto",
            )}
          >
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={onEdit}
              aria-label="Edit system skill"
            >
              <IconPencil size={14} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 text-danger"
              onClick={onDelete}
              aria-label="Delete system skill"
            >
              <IconTrash size={14} />
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
