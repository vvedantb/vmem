import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "@vmem/backend";
import { Badge, Button, Card, CardContent } from "@vmem/ui";
import { useUser } from "@clerk/clerk-react";
import {
  IconPlus,
  IconTrash,
  IconLoader2,
  IconUser,
} from "@tabler/icons-react";
import { toast } from "sonner";
import { useTeamWorkspace, type TeamMember } from "./team-context";
import { AddMemberDialog } from "./AddMemberDialog";
import { RemoveMemberDialog } from "./RemoveMemberDialog";

type PendingRemoval = {
  userId: Id<"users">;
  label: string;
};

export function TeamMembers() {
  const { detail: data, meta } = useTeamWorkspace();
  const removeMember = useMutation(api.teams.removeMember);
  const [addOpen, setAddOpen] = useState(false);
  const [removing, setRemoving] = useState<Id<"users"> | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<PendingRemoval | null>(
    null,
  );
  const currentUser = useQuery(api.users.getMe);
  const { user: clerkUser } = useUser();

  const handleRemoveConfirm = async () => {
    if (!pendingRemoval) return;
    setRemoving(pendingRemoval.userId);
    try {
      await removeMember({
        teamId: data.team._id,
        userId: pendingRemoval.userId,
      });
      toast.success("Member removed");
      setPendingRemoval(null);
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
        {meta.isOwner ? (
          <Button variant="outline" size="sm" onClick={() => setAddOpen(true)}>
            <IconPlus size={16} />
            Add member
          </Button>
        ) : null}
      </div>

      <Card className="shadow-none">
        <CardContent className="p-2">
          {data.members.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted">
              No members yet.
            </div>
          ) : (
            <ul className="flex flex-col gap-1">
              {data.members.map((member) => (
                <MemberRow
                  key={member.userId}
                  member={member}
                  currentUserId={currentUser?._id}
                  clerkImageUrl={clerkUser?.imageUrl}
                  removingUserId={removing}
                  onRemove={(userId, label) =>
                    setPendingRemoval({ userId, label })
                  }
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <AddMemberDialog
        teamId={data.team._id}
        open={addOpen}
        onOpenChange={setAddOpen}
      />

      <RemoveMemberDialog
        open={pendingRemoval !== null}
        memberLabel={pendingRemoval?.label ?? ""}
        teamName={data.team.name}
        submitting={removing !== null}
        onClose={() => {
          if (removing === null) setPendingRemoval(null);
        }}
        onConfirm={() => void handleRemoveConfirm()}
      />
    </div>
  );
}

function MemberRow({
  member,
  currentUserId,
  clerkImageUrl,
  removingUserId,
  onRemove,
}: {
  member: TeamMember;
  currentUserId: Id<"users"> | undefined;
  clerkImageUrl: string | undefined;
  removingUserId: Id<"users"> | null;
  onRemove: (userId: Id<"users">, label: string) => void;
}) {
  const { meta } = useTeamWorkspace();
  const name = memberLabel(member);
  const isSelf = member.userId === currentUserId;
  const canRemoveMember =
    meta.isOwner && !isSelf && currentUserId !== undefined;
  const isRemoving = removingUserId === member.userId;

  return (
    <li className="flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 transition-[background-color] hover:bg-surface-tertiary/50">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <MemberAvatar imageUrl={isSelf ? clerkImageUrl : undefined} />
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-foreground">
            {name}
          </div>
          {member.email ? (
            <div className="truncate text-xs text-muted">{member.email}</div>
          ) : null}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Badge
          variant={member.role === "owner" ? "default" : "secondary"}
          className="capitalize"
        >
          {member.role}
        </Badge>
        {canRemoveMember ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onRemove(member.userId, name)}
            disabled={isRemoving}
            className="text-muted hover:text-danger"
          >
            {isRemoving ? (
              <IconLoader2 size={14} className="animate-spin" />
            ) : (
              <IconTrash size={14} />
            )}
          </Button>
        ) : null}
      </div>
    </li>
  );
}

function memberLabel(m: TeamMember): string {
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
