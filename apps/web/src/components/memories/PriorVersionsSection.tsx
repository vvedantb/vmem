import { useQuery } from "convex/react";
import { api } from "@vmem/backend";
import { formatDateTime } from "@vmem/shared";
import { useActiveProfileId } from "@/components/workspace/active-profile";

// memory detail History: older memories a newer fact replaced (an update or a
// resolved contradiction), newest first. Hidden when there are none.
export default function PriorVersionsSection({
  memoryId,
}: {
  memoryId: string;
}) {
  const profileId = useActiveProfileId();
  const versions = useQuery(api.memoryApi.history, { memoryId, profileId });
  if (!versions || versions.length === 0) return null;
  return (
    <section className="mb-6 space-y-2" data-testid="prior-versions">
      <h4 className="text-xs font-medium text-muted">
        {versions.length === 1
          ? "1 previous version"
          : `${versions.length.toLocaleString()} previous versions`}
      </h4>
      <ul className="space-y-1.5">
        {versions.map((version) => (
          <li
            key={version.id}
            className="space-y-0.5 rounded-lg bg-surface-secondary px-3 py-2"
          >
            <p className="truncate text-sm text-foreground">{version.title}</p>
            <p className="line-clamp-2 text-xs text-muted">{version.content}</p>
            <p className="text-[11px] tabular-nums text-muted">
              {formatDateTime(version.createdAt)}
              {version.supersededAt === null
                ? null
                : ` · replaced ${formatDateTime(version.supersededAt)}`}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
