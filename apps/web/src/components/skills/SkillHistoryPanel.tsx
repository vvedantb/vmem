import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@vmem/backend";
import type { Id } from "@vmem/backend";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  cn,
} from "@vmem/ui";
import { IconHistory, IconLoader2 } from "@tabler/icons-react";
import { toast } from "sonner";
import type { SkillVersionListEntry } from "@/components/skills/_utils";
import { formatRelativeTime } from "@vmem/shared";
import { updateAllCachedQueries } from "@/lib/convex-optimistic";

interface SkillHistoryPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  skillId: Id<"skills"> | null;
}

interface SkillVersionListItemProps {
  createdAt: number;
  authorLabel: string;
  source: string;
  active: boolean;
  onSelect: () => void;
}

function SkillVersionListItem({
  createdAt,
  authorLabel,
  source,
  active,
  onSelect,
}: SkillVersionListItemProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      onClick={onSelect}
      className={cn(
        "flex h-auto w-full flex-col items-start gap-1 rounded-md px-2.5 py-2 text-left",
        active ? "bg-surface-tertiary" : "hover:bg-surface-tertiary/50",
      )}
    >
      <span className="text-xs font-medium text-foreground">
        {formatRelativeTime(createdAt)}
      </span>
      <Badge
        variant={source === "mcp" ? "default" : "outline"}
        className="h-4 px-1.5 text-[10px] font-normal"
      >
        {authorLabel}
      </Badge>
    </Button>
  );
}

function resolveActiveVersionId(
  versions: SkillVersionListEntry[] | undefined,
  selectedId: Id<"skillVersions"> | null,
): Id<"skillVersions"> | null {
  if (!versions || versions.length === 0) return null;
  if (selectedId && versions.some((version) => version._id === selectedId)) {
    return selectedId;
  }
  return versions.at(0)?._id ?? null;
}

// version history for a skill
export function SkillHistoryPanel({
  open,
  onOpenChange,
  skillId,
}: SkillHistoryPanelProps) {
  const versions = useQuery(
    api.skillVersions.list,
    open && skillId ? { skillId } : "skip",
  );
  const [selectedId, setSelectedId] = useState<Id<"skillVersions"> | null>(
    null,
  );
  const [restoring, setRestoring] = useState(false);

  const activeVersionId = open
    ? resolveActiveVersionId(versions, selectedId)
    : null;

  const selected = useQuery(
    api.skillVersions.get,
    activeVersionId ? { versionId: activeVersionId } : "skip",
  );
  const restoreVersion = useMutation(
    api.skills.restoreVersion,
  ).withOptimisticUpdate((localStore, args) => {
    const version = localStore.getQuery(api.skillVersions.get, {
      versionId: args.versionId,
    });
    if (version === undefined || version === null) return;
    updateAllCachedQueries(localStore, api.skills.listMy, (skills) =>
      skills.map((s) =>
        s._id === version.skillId
          ? {
              ...s,
              name: version.name,
              description: version.description,
              instructions: version.instructions,
              enabled: version.enabled,
              updatedAt: Date.now(),
            }
          : s,
      ),
    );
  });

  const handleOpenChange = (next: boolean) => {
    if (!next) setSelectedId(null);
    onOpenChange(next);
  };

  const handleRestore = async () => {
    if (!activeVersionId) return;
    setRestoring(true);
    try {
      await restoreVersion({ versionId: activeVersionId });
      toast.success("Version restored");
      handleOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to restore");
    } finally {
      setRestoring(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex h-[min(80vh,640px)] max-w-3xl flex-col gap-3">
        <DialogHeader>
          <DialogTitle>Version history</DialogTitle>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 gap-3">
          <div className="flex w-56 shrink-0 flex-col overflow-y-auto rounded-lg bg-surface-secondary/40 p-1 scrollbar-thin">
            {versions === undefined ? (
              <div className="flex flex-1 items-center justify-center">
                <IconLoader2 size={16} className="animate-spin text-muted" />
              </div>
            ) : versions.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 px-3 py-6 text-center">
                <IconHistory size={24} className="text-muted" />
                <p className="text-xs text-muted">
                  No versions yet. A version is saved before the skill is
                  changed after a break, or whenever an agent edits it.
                </p>
              </div>
            ) : (
              versions.map((ver) => (
                <SkillVersionListItem
                  key={ver._id}
                  createdAt={ver.createdAt}
                  authorLabel={ver.authorLabel}
                  source={ver.source}
                  active={ver._id === activeVersionId}
                  onSelect={() => setSelectedId(ver._id)}
                />
              ))
            )}
          </div>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto rounded-lg bg-surface-secondary/40 px-4 py-3 scrollbar-thin">
            {selected === undefined && activeVersionId !== null ? (
              <div className="flex flex-1 items-center justify-center">
                <IconLoader2 size={16} className="animate-spin text-muted" />
              </div>
            ) : selected ? (
              <>
                <p className="text-sm font-medium text-foreground">
                  {selected.name}
                </p>
                {selected.description ? (
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted">
                      Description
                    </p>
                    <p className="whitespace-pre-wrap text-sm text-foreground">
                      {selected.description}
                    </p>
                  </div>
                ) : null}
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted">Instructions</p>
                  <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-foreground">
                    {selected.instructions}
                  </pre>
                </div>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center">
                <p className="text-sm text-muted">
                  Select a version to preview
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => handleOpenChange(false)}
          >
            Close
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!selected || restoring}
            onClick={() => void handleRestore()}
          >
            {restoring ? (
              <IconLoader2 size={14} className="animate-spin" />
            ) : null}
            Restore this version
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
