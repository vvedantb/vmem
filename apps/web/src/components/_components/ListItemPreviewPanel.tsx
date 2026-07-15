import { useNavigate } from "@tanstack/react-router";
import { Button } from "@vmem/ui";
import { IconArrowRight, IconX } from "@tabler/icons-react";
import { IconSkills, IconWiki } from "@/components/icons/sidebar";
import { useActiveProfile } from "@/components/workspace/active-profile";
import type { ListItem } from "@/lib/list-items";
import { formatListItemKindLabel } from "@/lib/list-items";

interface ListItemPreviewPanelProps {
  item: ListItem;
  onClose: () => void;
}

function kindLabel(item: ListItem): string {
  switch (item.kind) {
    case "wiki-document":
      return "Wiki";
    case "wiki-artifact":
      return "Artifact";
    case "wiki-folder":
      return "Folder";
    case "skill":
      return "Skill";
    case "memory":
      return formatListItemKindLabel(item.kind);
  }
}

function KindIcon({ item }: { item: ListItem }) {
  if (item.kind === "skill") {
    return <IconSkills size={16} stroke={1.7} className="text-muted" />;
  }
  return <IconWiki size={16} stroke={1.7} className="text-muted" />;
}

function glimpseText(item: ListItem): string {
  if (item.kind === "wiki-folder") {
    return `${item.childCount} ${item.childCount === 1 ? "item" : "items"} in this folder.`;
  }
  const trimmed = item.content.trim();
  if (trimmed.length === 0) {
    return item.kind === "skill" ? "No description yet." : "No content yet.";
  }
  return trimmed;
}

function jumpLabel(item: ListItem): string {
  switch (item.kind) {
    case "wiki-document":
    case "wiki-artifact":
      return "Open in Wiki";
    case "wiki-folder":
      return "Open Wiki";
    case "skill":
      return "Open skill";
    case "memory":
      return "Open";
  }
}

export default function ListItemPreviewPanel({
  item,
  onClose,
}: ListItemPreviewPanelProps) {
  const navigate = useNavigate();
  const activeProfile = useActiveProfile();

  const handleJump = () => {
    switch (item.kind) {
      case "wiki-document":
      case "wiki-artifact":
        void navigate({
          to: "/$profileId/wiki/$docId",
          params: { profileId: activeProfile._id, docId: item.wikiId },
        });
        return;
      case "wiki-folder":
        void navigate({
          to: "/$profileId/wiki",
          params: { profileId: activeProfile._id },
        });
        return;
      case "skill":
        void navigate({
          to: "/$profileId/skills/$id",
          params: { profileId: activeProfile._id, id: item.skillId },
        });
        return;
      case "memory":
        return;
    }
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      <div className="mb-3 flex shrink-0 items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-1.5">
            <KindIcon item={item} />
            <span className="text-xs text-muted">{kindLabel(item)}</span>
          </div>
          <h3 className="truncate text-lg font-semibold leading-snug text-foreground">
            {item.title}
          </h3>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          className="shrink-0 text-muted"
          aria-label="Close panel"
        >
          <IconX size={18} />
        </Button>
      </div>

      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto scrollbar-thin">
        <div className="rounded-lg bg-surface-secondary/60 p-4">
          <p className="line-clamp-8 overflow-wrap-anywhere whitespace-pre-wrap text-[15px] leading-relaxed text-pretty text-foreground/90">
            {glimpseText(item)}
          </p>
        </div>
      </div>

      <div className="mt-4 shrink-0">
        <Button type="button" onClick={handleJump} className="w-full gap-1.5">
          {jumpLabel(item)}
          <IconArrowRight size={16} />
        </Button>
      </div>
    </div>
  );
}
