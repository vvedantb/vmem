import { Badge, cn } from "@vmem/ui";
import { IconClockHour4 } from "@tabler/icons-react";
import type { TimelineEvent, TimelineMode } from "@/lib/timeline";
import DiffDisplay from "./DiffDisplay";

interface TimelineViewProps {
  events: TimelineEvent[];
  mode: TimelineMode;
}

const ACTION_STYLES: Record<string, { label: string; className: string }> = {
  created: {
    label: "Created",
    className: "border-success/25 bg-success/12 text-success",
  },
  updated: {
    label: "Updated",
    className: "border-border bg-default text-default-foreground",
  },
  deleted: {
    label: "Deleted",
    className: "border-danger/25 bg-danger/12 text-danger",
  },
  proposal_approved: {
    label: "Approved",
    className: "border-success/25 bg-success/12 text-success",
  },
  proposal_rejected: {
    label: "Rejected",
    className: "border-warning/25 bg-warning/12 text-warning",
  },
};

function getActionStyle(action: string) {
  return (
    ACTION_STYLES[action] ?? {
      label: action,
      className: "bg-surface-secondary text-muted",
    }
  );
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

export default function TimelineView({ events, mode }: TimelineViewProps) {
  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <IconClockHour4 className="h-10 w-10 text-muted mb-3" />
        <p className="text-sm text-muted">No events yet</p>
      </div>
    );
  }

  return (
    <div className="relative pl-8">
      <div className="absolute left-3 top-2 bottom-2 w-0.5 bg-separator" />
      <div className="space-y-6">
        {events.map((event, index) => {
          const style = getActionStyle(event.action);
          const prevEvent = index > 0 ? events[index - 1] : null;
          const showDiff =
            mode === "history" &&
            prevEvent?.snapshot !== null &&
            prevEvent?.snapshot !== undefined &&
            event.snapshot !== null &&
            event.snapshot !== undefined;
          const titleChanged =
            showDiff &&
            prevEvent?.snapshot !== null &&
            prevEvent?.snapshot !== undefined &&
            event.snapshot !== null &&
            prevEvent.snapshot.title !== event.snapshot.title;

          return (
            <div key={event.id} className="relative">
              <div className="absolute -left-8 top-1.5 flex h-5 w-5 items-center justify-center">
                <div
                  className={cn(
                    "h-3 w-3 rounded-full border-2 border-background",
                    event.connectionType === "related"
                      ? "bg-foreground/45"
                      : cn(
                          event.action === "created" && "bg-success",
                          event.action === "updated" && "bg-accent",
                          event.action === "deleted" && "bg-danger",
                          event.action === "proposal_approved" && "bg-success",
                          event.action === "proposal_rejected" && "bg-warning",
                          !ACTION_STYLES[event.action] &&
                            "bg-surface-secondary-foreground",
                        ),
                  )}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-muted">
                    {formatTimestamp(event.createdAt)}
                  </span>
                  <Badge className={cn("text-xs", style.className)}>
                    {style.label}
                  </Badge>
                  <span className="text-xs text-muted">by {event.actor}</span>
                </div>

                {mode === "trail" && (
                  <div
                    className={cn(
                      "space-y-1 border-l-2 pl-3",
                      event.connectionType === "related"
                        ? "border-border"
                        : "border-accent/40",
                    )}
                  >
                    <p className="text-sm font-medium text-foreground">
                      {event.memoryTitle}
                    </p>
                    {event.connectionType === "related" && event.reason && (
                      <Badge variant="outline" className="text-xs text-muted">
                        Connected via: {event.reason}
                      </Badge>
                    )}
                    {event.snapshot !== null && (
                      <>
                        <p className="text-sm text-muted line-clamp-3">
                          {event.snapshot.content.slice(0, 200)}
                        </p>
                        {event.snapshot.tags.length > 0 && (
                          <div className="flex gap-1 flex-wrap pt-1">
                            {event.snapshot.tags.map((tag) => (
                              <Badge
                                key={tag}
                                variant="outline"
                                className="text-xs"
                              >
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                    {event.snapshot === null && (
                      <p className="text-xs text-muted italic">
                        No snapshot available
                      </p>
                    )}
                  </div>
                )}

                {mode === "history" && (
                  <div className="space-y-2">
                    {titleChanged && prevEvent?.snapshot && event.snapshot && (
                      <div className="text-sm">
                        <span className="text-muted line-through">
                          {prevEvent.snapshot.title}
                        </span>
                        {" → "}
                        <span className="text-foreground font-medium">
                          {event.snapshot.title}
                        </span>
                      </div>
                    )}

                    {showDiff && prevEvent?.snapshot && event.snapshot ? (
                      <DiffDisplay
                        oldText={prevEvent.snapshot.content}
                        newText={event.snapshot.content}
                      />
                    ) : event.snapshot !== null ? (
                      <div className="rounded-lg bg-surface-secondary/30 p-3 text-sm whitespace-pre-wrap">
                        {event.snapshot.content}
                      </div>
                    ) : (
                      <p className="text-xs text-muted italic">
                        No snapshot available
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
