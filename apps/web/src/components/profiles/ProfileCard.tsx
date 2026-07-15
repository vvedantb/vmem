import { Button, Card, CardContent } from "@vmem/ui";
import { IconEdit, IconTrash } from "@tabler/icons-react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@vmem/backend";
import { ProfileAvatar } from "./ProfileAvatar";

type Profile = FunctionReturnType<typeof api.profiles.list>[number];

export function ProfileCard({
  profile,
  onEdit,
  onDelete,
}: {
  profile: Profile;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <Card className="relative shadow-none">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <ProfileAvatar
            icon={profile.icon}
            color={profile.color}
            className="h-10 w-10 rounded-lg"
            iconClassName="h-5 w-5"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-medium text-foreground truncate">
                {profile.name}
              </h3>
              {profile.isDefault && (
                <span className="text-[10px] uppercase tracking-wider text-muted bg-surface-secondary px-1.5 py-0.5 rounded">
                  Default
                </span>
              )}
            </div>
            <p className="text-xs text-muted mt-0.5">
              Created{" "}
              {new Date(profile.createdAt).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </p>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2 pt-3">
          <Button variant="ghost" size="icon-sm" onClick={onEdit}>
            <IconEdit className="h-4 w-4" />
          </Button>
          {!profile.isDefault && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onDelete}
              className="text-danger hover:text-danger"
            >
              <IconTrash className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
