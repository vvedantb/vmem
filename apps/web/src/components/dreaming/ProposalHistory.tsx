import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { Badge, Button, Card, CardContent, Skeleton } from "@vvedantb/ui";
import { api } from "@vmem/backend";
import { useActiveProfile } from "@/components/workspace/active-profile";
import { getProposalKindConfig } from "@/components/proposals/_proposalUtils";
import { useAsyncSubmit } from "@/hooks/useAsyncSubmit";
import { formatLogTime } from "../activity/_aiLogsUtils";
import { canUndoDreamAction, type ProposalHistoryRow } from "./_dreamingUtils";

// Dreaming page History tab: proposals already approved or rejected. An
// approved merge or update can be undone while its 30-day window is open
// and the memories it hid still exist; other kinds are read-only.
export function ProposalHistory() {
  const profile = useActiveProfile();
  const rows = useQuery(api.proposedUpdateApi.listResolved, {
    profileId: profile._id,
  });
  const nowMs = Date.now();

  return (
    <section className="flex flex-col gap-4">
      <h2 className="px-0.5 text-sm font-medium text-foreground">
        Resolved proposals
      </h2>
      {rows === undefined ? (
        <Card className="shadow-none">
          <CardContent className="space-y-1 p-2">
            {[0, 1].map((index) => (
              <Skeleton
                key={index}
                className="h-11 rounded-lg bg-surface-tertiary/40"
              />
            ))}
          </CardContent>
        </Card>
      ) : rows.length === 0 ? (
        <Card className="shadow-none">
          <CardContent className="px-6 py-8 text-center text-sm text-muted">
            Proposals you approve or reject show here.
          </CardContent>
        </Card>
      ) : (
        <Card className="shadow-none">
          <CardContent className="p-2">
            <ul className="space-y-1">
              {rows.map((row) => (
                <ProposalHistoryItem
                  key={row.proposalId}
                  row={row}
                  nowMs={nowMs}
                />
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </section>
  );
}

function ProposalHistoryItem({
  row,
  nowMs,
}: {
  row: ProposalHistoryRow;
  nowMs: number;
}) {
  const undoAction = useMutation(api.dream.undoAction);
  const { submitting, run } = useAsyncSubmit();
  const kind = getProposalKindConfig(row.kind);
  const undo = row.undo;
  return (
    <li className="flex items-center gap-3 rounded-lg px-3 py-2">
      <span className="w-32 shrink-0 text-xs tabular-nums text-muted">
        {formatLogTime(row.resolvedAt)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <Badge variant={kind.badgeVariant} className="h-5 gap-1 px-1.5">
            <kind.Icon size={12} />
            {kind.label}
          </Badge>
          <span className="truncate text-sm text-foreground">{row.title}</span>
        </div>
        <p className="truncate text-xs text-muted">{row.reason}</p>
      </div>
      <Badge
        variant={row.status === "approved" ? "secondary" : "outline"}
        className="h-5 shrink-0 px-1.5 text-[11px]"
      >
        {row.status === "approved" ? "Approved" : "Rejected"}
      </Badge>
      {undo === null ? null : undo.undoneAt !== undefined ? (
        <span className="shrink-0 text-xs text-muted">Undone</span>
      ) : canUndoDreamAction(undo, nowMs) ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={submitting}
          onClick={() => {
            void run(async () => {
              await undoAction({ actionId: undo.actionId });
              toast.success("Undone");
            }, "Undo failed");
          }}
        >
          Undo
        </Button>
      ) : null}
    </li>
  );
}
