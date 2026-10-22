import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { toast } from "sonner";
import { Button } from "@vvedantb/ui";
import { api } from "@vmem/backend";
import { canUndoDreamAction } from "@/components/dreaming/_dreamingUtils";
import { useAsyncSubmit } from "@/hooks/useAsyncSubmit";

type MergedGroup = FunctionReturnType<
  typeof api.dream.mergedFrom
>["groups"][number];

// memory detail: rows dreaming hid into this memory, each group with
// "Split out" (undo of that dream action) while its window is open
export default function MergedFromSection({ memoryId }: { memoryId: string }) {
  const merged = useQuery(api.dream.mergedFrom, { memoryId });
  if (!merged || merged.total === 0) return null;
  const nowMs = Date.now();
  return (
    <section className="mt-6 space-y-2" data-testid="merged-from">
      <h4 className="text-xs font-medium text-muted">
        Merged from{" "}
        {merged.total === 1
          ? "1 memory"
          : `${merged.total.toLocaleString()} memories`}
      </h4>
      <ul className="space-y-1.5">
        {merged.groups.map((group) => (
          <MergedGroupRow key={group.actionId} group={group} nowMs={nowMs} />
        ))}
      </ul>
    </section>
  );
}

function MergedGroupRow({
  group,
  nowMs,
}: {
  group: MergedGroup;
  nowMs: number;
}) {
  const undoAction = useMutation(api.dream.undoAction);
  const { submitting, run } = useAsyncSubmit();
  return (
    <li className="flex items-start gap-2 rounded-lg bg-surface-secondary px-3 py-2">
      <div className="min-w-0 flex-1 space-y-0.5">
        {group.rows.map((row) => (
          <p key={row.id} className="truncate text-sm text-foreground">
            {row.title}
          </p>
        ))}
      </div>
      {canUndoDreamAction(group, nowMs) ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="shrink-0"
          disabled={submitting}
          onClick={() => {
            void run(async () => {
              await undoAction({ actionId: group.actionId });
              toast.success("Split out");
            }, "Split out failed");
          }}
        >
          Split out
        </Button>
      ) : null}
    </li>
  );
}
