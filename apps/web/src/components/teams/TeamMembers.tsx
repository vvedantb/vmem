import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@vmem/backend";
import { Badge, Button, Card, CardContent } from "@vmem/ui";
import { useUser } from "@clerk/clerk-react";
import {
  IconPlus,
  IconTrash,
  IconLoader2,
  IconUser,
} from "@tabler/icons-react";
import { toast } from "sonner";
import { useTeamDetail, type TeamDetail } from "./team-context";
import { AddMemberDialog } from "./AddMemberDialog";

export function TeamMembers() {
  const data = useTeamDetail();
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
  const currentUser = useQuery(api.users.getMe);
  const { user: clerkUser } = useUser();

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

      <Card className="shadow-none">
        <CardContent className="p-2">
          {data.members.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted">
              No members yet.
            </div>
          ) : (
            <ul className="flex flex-col gap-1">
              {data.members.map((m) => {
                const name = memberLabel(m);
                const isSelf = m.userId === currentUser?._id;
                const canRemoveMember =
                  isOwner && !isSelf && currentUser !== undefined;

                return (
                  <li
                    key={m.userId}
                    className="flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 transition-[background-color] hover:bg-surface-tertiary/50"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <MemberAvatar
                        imageUrl={isSelf ? clerkUser?.imageUrl : undefined}
                      />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-foreground">
                          {name}
                        </div>
                        {m.email ? (
                          <div className="truncate text-xs text-muted">
                            {m.email}
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={m.role === "owner" ? "default" : "secondary"}
                        className="capitalize"
                      >
                        {m.role}
                      </Badge>
                      {canRemoveMember ? (
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
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <AddMemberDialog
        teamId={data.team._id}
        open={addOpen}
        onOpenChange={setAddOpen}
      />
    </div>
  );
}

function memberLabel(m: TeamDetail["members"][number]): string {
  return (
    m.fullName ||
    [m.firstName, m.lastName].filter(Boolean).join(" ") ||
    m.email ||
    "Unknown"
  );
}

function MemberAvatar({ imageUrl }: { imageUrl: string | undefined }) {
  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt=""
        className="h-8 w-8 shrink-0 rounded-lg object-cover outline outline-1 -outline-offset-1 outline-separator"
      />
    );
  }

  return (
    <div
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-tertiary/60"
      aria-hidden
    >
      <IconUser size={16} className="text-muted" />
    </div>
  );
}
