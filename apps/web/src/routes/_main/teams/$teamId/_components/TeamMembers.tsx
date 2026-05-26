import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@vmem/backend";
import { Button, Badge } from "@vmem/ui";
import { IconPlus, IconTrash, IconLoader2 } from "@tabler/icons-react";
import { toast } from "sonner";
import type { TeamDetail } from "../-team-detail";
import { AddMemberDialog } from "./AddMemberDialog";

export function TeamMembers({ data }: { data: TeamDetail }) {
  const removeMember = useMutation(api.teams.removeMember).withOptimisticUpdate(
    (localStore, args) => {
      const detail = localStore.getQuery(api.teams.get, {
        teamId: args.teamId,
      });
      if (detail) {
        localStore.setQuery(
          api.teams.get,
          { teamId: args.teamId },
          {
            ...detail,
            members: detail.members.filter((m) => m.userId !== args.userId),
          },
        );
      }
      const list = localStore.getQuery(api.teams.list, {});
      if (list) {
        localStore.setQuery(
          api.teams.list,
          {},
          list.map((entry) =>
            entry.team._id === args.teamId
              ? { ...entry, memberCount: Math.max(0, entry.memberCount - 1) }
              : entry,
          ),
        );
      }
    },
  );
  const [addOpen, setAddOpen] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  const isOwner = data.role === "owner";

  const handleRemove = async (userId: string, label: string) => {
    const confirmed = window.confirm(`Remove ${label} from ${data.team.name}?`);
    if (!confirmed) return;
    setRemoving(userId);
    try {
      await removeMember({ teamId: data.team._id, userId });
      toast.success("Member removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove");
    } finally {
      setRemoving(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted">
          {data.members.length}{" "}
          {data.members.length === 1 ? "member" : "members"}
        </div>
        {isOwner && (
          <Button variant="outline" size="sm" onClick={() => setAddOpen(true)}>
            <IconPlus size={16} />
            Add member
          </Button>
        )}
      </div>

      <ul className="flex flex-col gap-1">
        {data.members.map((m) => {
          const name =
            m.fullName ||
            [m.firstName, m.lastName].filter(Boolean).join(" ") ||
            m.email ||
            "Unknown";
          return (
            <li
              key={m.userId}
              className="flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 transition-[background-color] hover:bg-surface-secondary/80 dark:hover:bg-surface-tertiary/50"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-foreground">
                  {name}
                </div>
                {m.email && (
                  <div className="truncate text-xs text-muted">{m.email}</div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Badge
                  variant={m.role === "owner" ? "default" : "secondary"}
                  className="capitalize"
                >
                  {m.role}
                </Badge>
                {isOwner && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemove(m.userId, name)}
                    disabled={removing === m.userId}
                    className="text-muted hover:text-danger"
                  >
                    {removing === m.userId ? (
                      <IconLoader2 size={14} className="animate-spin" />
                    ) : (
                      <IconTrash size={14} />
                    )}
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <AddMemberDialog
        teamId={data.team._id}
        open={addOpen}
        onOpenChange={setAddOpen}
      />
    </div>
  );
}
