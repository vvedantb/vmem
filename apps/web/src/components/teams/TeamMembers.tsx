import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useNavigate } from "@tanstack/react-router";
import { api, type Id } from "@vmem/backend";
import { Badge, Button } from "@vmem/ui";
import { useUser } from "@clerk/clerk-react";
import {
  IconPlus,
  IconTrash,
  IconLoader2,
  IconUser,
  IconLogout,
} from "@tabler/icons-react";
import { toast } from "sonner";
import { convexErrorMessage } from "@/lib/convex-error";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { useTeamWorkspace, type TeamMember } from "./team-context";
import { AddMemberDialog } from "./AddMemberDialog";
import { RemoveMemberDialog } from "./RemoveMemberDialog";
import { LeaveTeamDialog } from "./LeaveTeamDialog";

type PendingRemoval = {
  userId: Id<"users">;
  label: string;
};

export function TeamMembers() {
  const { detail: data, meta } = useTeamWorkspace();
  const navigate = useNavigate();
  const removeMember = useMutation(api.teams.removeMember).withOptimisticUpdate(
    (localStore, args) => {
      const detail = localStore.getQuery(api.teams.get, {
        teamId: args.teamId,
      });
      if (detail == null) return;
      localStore.setQuery(
        api.teams.get,
        { teamId: args.teamId },
        {
          ...detail,
          members: detail.members.filter(
            (m) => (m.userId as string) !== args.userId,
          ),
        },
      );
    },
  );
  const leaveTeam = useMutation(api.teams.leaveTeam).withOptimisticUpdate(
    (localStore, args) => {
      const profiles = localStore.getQuery(api.profiles.list, {});
      if (profiles !== undefined) {
        localStore.setQuery(
          api.profiles.list,
          {},
          profiles.filter(
            (p) => (p.teamId as string | undefined) !== args.teamId,
          ),
        );
      }
    },
  );
  const [addOpen, setAddOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
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
      toast.error(convexErrorMessage(err, "Failed to remove"));
    }
    // after the try rather than in a `finally` React Compiler bails on the
    // whole file when it meets one. The catch swallows, so this always runs.
    setRemoving(null);
  };

  const handleLeaveConfirm = async () => {
    setLeaving(true);
    try {
      await leaveTeam({ teamId: data.team._id });
      toast.success(`Left ${data.team.name}`);
      setLeaveOpen(false);
      await navigate({ to: "/home" });
    } catch (err) {
      toast.error(convexErrorMessage(err, "Failed to leave team"));
      setLeaving(false);
    }
  };

  const memberCount = data.members.length;

  return (
    <>
      <SettingsSection
        title="Members"
        description={`${memberCount} ${memberCount === 1 ? "member" : "members"}. Everyone can read and write team memories.`}
        action={
          meta.isOwner ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAddOpen(true)}
            >
              <IconPlus size={16} />
              Add member
            </Button>
          ) : null
        }
        bodyVariant="list"
      >
        {memberCount === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-muted">
            No members yet.
          </div>
        ) : (
          <ul>
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
      </SettingsSection>

      {meta.isOwner ? null : (
        <SettingsSection
          title="Leave team"
          description="You'll lose access to this shared profile and its memories."
        >
          <Button
            variant="outline"
            onClick={() => setLeaveOpen(true)}
            disabled={leaving}
            className="text-danger hover:text-danger"
          >
            <IconLogout size={14} className="mr-1.5" />
            Leave team
          </Button>
        </SettingsSection>
      )}

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

      <LeaveTeamDialog
        open={leaveOpen}
        teamName={data.team.name}
        submitting={leaving}
        onClose={() => {
          if (!leaving) setLeaveOpen(false);
        }}
        onConfirm={() => void handleLeaveConfirm()}
      />
    </>
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
    <li className="flex items-center justify-between gap-3 px-4 py-3">
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
            aria-label={`Remove ${name}`}
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
