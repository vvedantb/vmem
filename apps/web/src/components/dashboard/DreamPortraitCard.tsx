import { Card, CardContent } from "@vmem/ui";
import { IconMoonStars } from "@tabler/icons-react";
import { useActiveProfile } from "../workspace/active-profile";
import { formatRelativeTime } from "@/lib/formatters";

// dream Mode's evolving portrait of this workspace's owner
export function DreamPortraitCard() {
  const profile = useActiveProfile();
  if (!profile.dreamPortrait) return null;

  const sourceCount = profile.dreamPortraitSources?.length ?? 0;
  const groundedSuffix =
    sourceCount > 0
      ? ` · grounded in ${sourceCount} ${sourceCount === 1 ? "memory" : "memories"}`
      : "";

  return (
    <Card className="shadow-none">
      <CardContent className="space-y-3 p-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <IconMoonStars size={16} className="text-muted" stroke={1.5} />
            <h3 className="text-sm font-medium text-foreground text-balance">
              Inferred portrait
            </h3>
          </div>
          <span className="text-xs text-muted">
            Dreamt {formatRelativeTime(profile.dreamPortraitUpdatedAt ?? null)}
            {groundedSuffix}
          </span>
        </div>
        <p className="whitespace-pre-wrap break-words text-sm text-muted">
          {profile.dreamPortrait}
        </p>
      </CardContent>
    </Card>
  );
}
