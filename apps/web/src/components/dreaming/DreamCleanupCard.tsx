import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import {
  Badge,
  Button,
  Card,
  CardContent,
  ConfirmDialog,
  Spinner,
} from "@vvedantb/ui";
import { IconSparkles, IconWand } from "@tabler/icons-react";
import { api } from "@vmem/backend";
import { useActiveProfile } from "@/components/workspace/active-profile";
import { convexErrorMessage } from "@/lib/convex-error";
import {
  cleanupCardState,
  plural,
  type CleanupCardState,
  type DreamRun,
} from "./_dreamingUtils";

type SampleGroup = NonNullable<DreamRun["sample"]>[number];
type PendingCleanup = Extract<CleanupCardState, { kind: "pending" }>;

const COLLAPSED_GROUPS = 3;

// one-off duplicate cleanup: shown above the Dreaming page tabs while the
// profile's latest dry run is not yet applied
export function DreamCleanupCard() {
  const profile = useActiveProfile();
  const latest = useQuery(api.dreamCleanup.latestForProfile, {
    profileId: profile._id,
  });
  if (latest === undefined) return null;
  const state = cleanupCardState(latest);
  if (state.kind === "none") return null;

  return (
    <Card className="shadow-none" data-testid="dream-cleanup-card">
      <CardContent className="space-y-3 p-6">
        <div className="flex items-center gap-2">
          <IconWand size={16} className="text-muted" stroke={1.5} />
          <h3 className="text-sm font-medium text-foreground text-balance">
            Duplicate cleanup
          </h3>
        </div>
        {state.kind === "pending" ? (
          <PendingCleanupBody state={state} />
        ) : (
          <p className="flex items-center gap-2 text-sm text-muted">
            <Spinner size={14} tone="inherit" decorative />
            {state.kind === "scanning"
              ? "Scanning for duplicates…"
              : "Cleaning up duplicates…"}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function PendingCleanupBody({ state }: { state: PendingCleanup }) {
  // UI-only: expanded review list and the confirm dialog
  const [reviewing, setReviewing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const applyCleanup = useMutation(api.dreamCleanup.applyCleanup);
  const shown = reviewing
    ? state.deterministic
    : state.deterministic.slice(0, COLLAPSED_GROUPS);

  const doneMessage =
    state.ai.length > 0
      ? "Cleaning up. AI suggestions are on the Proposals tab."
      : "Cleaning up. You can undo each group on the History tab.";

  const handleApply = async () => {
    try {
      await applyCleanup({ runId: state.runId });
      setConfirmOpen(false);
      toast.success(doneMessage);
    } catch (err) {
      toast.error(convexErrorMessage(err, "Cleanup failed"));
    }
  };

  return (
    <>
      <p className="text-sm text-foreground">
        Found {plural(state.rows, "duplicate row")} in{" "}
        {plural(state.groups, "group")}.
      </p>
      {shown.length > 0 ? (
        <ul className="space-y-1.5">
          {shown.map((group) => (
            <SampleGroupRow
              key={group.keeperId ?? group.keeperTitle}
              group={group}
              showLosers={reviewing}
            />
          ))}
        </ul>
      ) : null}
      {state.ai.length > 0 ? (
        <div className="space-y-1.5">
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted">
            <IconSparkles size={14} stroke={1.5} />
            AI suggests — needs your approval
          </p>
          <ul className="space-y-1.5">
            {state.ai.map((group) => (
              <SampleGroupRow
                key={group.keeperId ?? group.keeperTitle}
                group={group}
                showLosers={reviewing}
              />
            ))}
          </ul>
        </div>
      ) : null}
      <div className="flex items-center gap-2 pt-1">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setReviewing(!reviewing)}
        >
          {reviewing ? "Hide details" : "Review"}
        </Button>
        <Button type="button" size="sm" onClick={() => setConfirmOpen(true)}>
          Clean up
        </Button>
      </div>

      <ConfirmDialog.Root
        alert={false}
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
      >
        <ConfirmDialog.Content className="sm:max-w-md">
          <ConfirmDialog.Header>
            <ConfirmDialog.Title>Clean up duplicates?</ConfirmDialog.Title>
            <ConfirmDialog.Description>
              Hides {plural(state.rows, "duplicate row")} in{" "}
              {plural(state.groups, "group")} and keeps one memory per group.
              You can undo each group for 30 days on the History tab. After
              that, the hidden copies are deleted.
              {state.ai.length > 0
                ? ` ${plural(state.ai.length, "AI suggestion")} go to the Proposals tab for approval.`
                : ""}
            </ConfirmDialog.Description>
          </ConfirmDialog.Header>
          <ConfirmDialog.Footer>
            <ConfirmDialog.Cancel className="text-muted" />
            <ConfirmDialog.Action
              onClick={handleApply}
              pendingLabel="Cleaning up…"
              spinnerSize={14}
            >
              Clean up
            </ConfirmDialog.Action>
          </ConfirmDialog.Footer>
        </ConfirmDialog.Content>
      </ConfirmDialog.Root>
    </>
  );
}

function SampleGroupRow({
  group,
  showLosers,
}: {
  group: SampleGroup;
  showLosers: boolean;
}) {
  const losers = group.loserTitles ?? [];
  return (
    <li className="rounded-lg bg-surface-secondary px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm text-foreground">
          {group.keeperTitle}
        </span>
        <Badge variant="secondary" className="h-5 px-1.5 text-[11px]">
          ×{group.count}
        </Badge>
      </div>
      {showLosers ? (
        <div className="mt-1 space-y-0.5 text-xs text-muted">
          {group.reason ? <p>{group.reason}</p> : null}
          {losers.map((title, index) => (
            <p key={`${title}-${String(index)}`} className="truncate">
              hides: {title}
            </p>
          ))}
        </div>
      ) : null}
    </li>
  );
}
