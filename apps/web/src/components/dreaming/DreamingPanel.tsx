import { useState } from "react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { toast } from "sonner";
import {
  Badge,
  Button,
  ButtonGroup,
  Card,
  CardContent,
  cn,
  ConfirmDialog,
  Skeleton,
} from "@vvedantb/ui";
import {
  IconChevronDown,
  IconChevronRight,
  IconMoon,
} from "@tabler/icons-react";
import { api } from "@vmem/backend";
import { useActiveProfile } from "@/components/workspace/active-profile";
import { useAsyncSubmit } from "@/hooks/useAsyncSubmit";
import { useDashboardStats } from "@/hooks/useDashboardStats";
import { convexErrorMessage } from "@/lib/convex-error";
import RunDreamModeButton from "@/components/proposals/RunDreamModeButton";
import { formatCostUsd, formatLogTime } from "../activity/_aiLogsUtils";
import {
  canUndoDreamAction,
  cleanupStopNote,
  dreamActionKindLabel,
  dreamRunCountParts,
  dreamTriggerLabel,
  formatScanAgainAt,
  groupDreamActionsByKind,
  plural,
  scanCooldownUntil,
  type DreamAction,
  type DreamRun,
} from "./_dreamingUtils";

const ACTIONS_PAGE_SIZE = 50;

// Dreaming page History tab: the dreaming log (runs, their changes, undo)
export function DreamingPanel() {
  const runs = useQuery(api.dream.listRuns);
  // UI-only: one run open at a time
  const [openRunId, setOpenRunId] = useState<DreamRun["_id"] | null>(null);

  return (
    <section className="flex flex-col gap-4">
      <h2 className="px-0.5 text-sm font-medium text-foreground">Dream runs</h2>
      {runs === undefined ? (
        <RunsLoadingSkeleton />
      ) : runs.length === 0 ? (
        <EmptyState />
      ) : (
        <Card className="shadow-none">
          <CardContent className="space-y-1 p-2">
            {runs.map((run) => (
              <RunRow
                key={run._id}
                run={run}
                open={openRunId === run._id}
                onToggle={() =>
                  setOpenRunId(openRunId === run._id ? null : run._id)
                }
              />
            ))}
          </CardContent>
        </Card>
      )}
    </section>
  );
}

// Dreaming page header: the only scan / run controls in the app
export function DreamingActions() {
  return (
    <ButtonGroup>
      <ScanForDuplicatesButton />
      <RunDreamModeButton />
    </ButtonGroup>
  );
}

function ScanForDuplicatesButton() {
  const profile = useActiveProfile();
  const startDryRun = useMutation(api.dreamCleanup.startDryRun);
  const latest = useQuery(api.dreamCleanup.latestForProfile, {
    profileId: profile._id,
  });
  // UI-only: confirm dialog
  const [confirmOpen, setConfirmOpen] = useState(false);
  // the sidebar's cached stats entry; read only while the dialog is open
  const stats = useDashboardStats(profile._id, confirmOpen);
  const { submitting, run } = useAsyncSubmit();
  if (profile.teamId !== undefined) return null;
  const until = latest ? scanCooldownUntil(latest.startedAt, Date.now()) : null;
  const hint =
    until === null ? null : `You can scan again at ${formatScanAgainAt(until)}`;
  const coolingDown = until !== null || latest?.status === "running";
  const total = stats.data?.totalMemories;
  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        title={hint ?? undefined}
        disabled={submitting || coolingDown}
        onClick={() => setConfirmOpen(true)}
      >
        {hint ?? "Scan for duplicates"}
      </Button>
      <ConfirmDialog.Root
        alert={false}
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        pending={submitting}
      >
        <ConfirmDialog.Content className="sm:max-w-md">
          <ConfirmDialog.Header>
            <ConfirmDialog.Title>Scan all memories?</ConfirmDialog.Title>
            <ConfirmDialog.Description>
              {total === undefined
                ? "This goes through all of your memories"
                : `This goes through all ${total.toLocaleString()} of your memories`}{" "}
              to find duplicates and conflicts. It can take a few minutes.
            </ConfirmDialog.Description>
          </ConfirmDialog.Header>
          <ConfirmDialog.Footer>
            <ConfirmDialog.Cancel className="text-muted" />
            <ConfirmDialog.Action
              onClick={() => {
                void run(async () => {
                  await startDryRun({ profileId: profile._id });
                  setConfirmOpen(false);
                  toast.message(
                    "Scanning for duplicates. Nothing changes yet.",
                  );
                }, "Scan failed to start");
              }}
              pendingLabel="Starting…"
              spinnerSize={14}
            >
              Start scan
            </ConfirmDialog.Action>
          </ConfirmDialog.Footer>
        </ConfirmDialog.Content>
      </ConfirmDialog.Root>
    </>
  );
}

function RunRow({
  run,
  open,
  onToggle,
}: {
  run: DreamRun;
  open: boolean;
  onToggle: () => void;
}) {
  const parts = dreamRunCountParts(run);
  const Chevron = open ? IconChevronDown : IconChevronRight;
  return (
    <div className={cn("rounded-lg", open && "bg-surface-secondary")}>
      <Button
        type="button"
        variant="ghost"
        onClick={onToggle}
        aria-expanded={open}
        className="block h-auto w-full justify-start rounded-lg px-4 py-3 text-left font-normal hover:bg-surface-tertiary/50 active:scale-100"
      >
        <div className="flex items-center gap-3">
          <Chevron size={14} className="shrink-0 text-muted" />
          <span className="w-32 shrink-0 text-xs tabular-nums text-muted">
            {formatLogTime(run.startedAt)}
          </span>
          <span className="shrink-0 text-xs font-medium text-foreground">
            {dreamTriggerLabel(run.trigger)}
          </span>
          {run.dryRun ? (
            <Badge variant="outline" className="h-5 px-1.5 text-[11px]">
              Dry run
            </Badge>
          ) : null}
          {run.status !== "ok" ? (
            <Badge
              variant={run.status === "failed" ? "destructive" : "secondary"}
              className="h-5 px-1.5 text-[11px]"
            >
              {run.status}
            </Badge>
          ) : null}
          <span className="min-w-0 flex-1 truncate text-xs text-foreground">
            {parts.length > 0 ? parts.join(" · ") : "No changes"}
          </span>
          <span className="hidden shrink-0 text-xs tabular-nums text-muted md:inline">
            {plural(run.aiCalls, "AI call")} · {formatCostUsd(run.costUsd)}
          </span>
        </div>
      </Button>
      {open ? <RunDetail run={run} /> : null}
    </div>
  );
}

function RunDetail({ run }: { run: DreamRun }) {
  if (run.dryRun) {
    const stopNote = cleanupStopNote(run);
    return (
      <p className="px-4 pb-3 text-xs text-muted">
        A dry run changes nothing. Review and apply it in the cleanup card.
        {stopNote ? ` ${stopNote}` : ""}
      </p>
    );
  }
  return <RunActions run={run} />;
}

function RunActions({ run }: { run: DreamRun }) {
  const paged = usePaginatedQuery(
    api.dream.listActions,
    { runId: run._id },
    { initialNumItems: ACTIONS_PAGE_SIZE },
  );
  const nowMs = Date.now();
  const groups = groupDreamActionsByKind(paged.results);
  const canUndoRun = paged.results.some((action) =>
    canUndoDreamAction(action, nowMs),
  );

  return (
    <div className="space-y-3 px-4 pb-3">
      {run.error ? <p className="text-xs text-danger">{run.error}</p> : null}
      {paged.status === "LoadingFirstPage" ? (
        <Skeleton className="h-8 rounded-lg bg-surface-tertiary/40" />
      ) : groups.length === 0 ? (
        <p className="text-xs text-muted">This run changed no memories.</p>
      ) : (
        groups.map((group) => (
          <div key={group.kind} className="space-y-1">
            <p className="text-xs font-medium text-muted">
              {dreamActionKindLabel(group.kind)} ({group.actions.length})
            </p>
            <ul className="space-y-1">
              {group.actions.map((action) => (
                <ActionRow key={action._id} action={action} nowMs={nowMs} />
              ))}
            </ul>
          </div>
        ))
      )}
      <div className="flex items-center gap-2">
        {paged.status === "CanLoadMore" || paged.status === "LoadingMore" ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={paged.status === "LoadingMore"}
            onClick={() => paged.loadMore(ACTIONS_PAGE_SIZE)}
          >
            {paged.status === "LoadingMore" ? "Loading…" : "Load more"}
          </Button>
        ) : null}
        {canUndoRun ? <UndoRunButton runId={run._id} /> : null}
      </div>
    </div>
  );
}

function ActionRow({ action, nowMs }: { action: DreamAction; nowMs: number }) {
  const undoAction = useMutation(api.dream.undoAction);
  const { submitting, run } = useAsyncSubmit();
  const hidden = action.memoryIds.length;
  return (
    <li className="flex items-center gap-2 rounded-lg bg-surface px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-foreground">
          {action.keeperTitle ?? "Deleted memory"}
        </p>
        <p className="truncate text-xs text-muted">
          {action.kind === "merge" || action.kind === "supersede"
            ? `hid ${plural(hidden, "row")}`
            : plural(hidden, "row")}
          {" · "}
          {action.reason}
          {action.ai
            ? ` · AI ${String(Math.round(action.ai.confidence * 100))}%`
            : ""}
        </p>
      </div>
      {action.undoneAt !== undefined ? (
        <span className="shrink-0 text-xs text-muted">Undone</span>
      ) : canUndoDreamAction(action, nowMs) ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={submitting}
          onClick={() => {
            void run(async () => {
              await undoAction({ actionId: action._id });
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

function UndoRunButton({ runId }: { runId: DreamRun["_id"] }) {
  const undoRun = useMutation(api.dream.undoRun);
  // UI-only: confirm dialog
  const [confirmOpen, setConfirmOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => setConfirmOpen(true)}
      >
        Undo whole run
      </Button>
      <ConfirmDialog.Root
        alert={false}
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
      >
        <ConfirmDialog.Content className="sm:max-w-md">
          <ConfirmDialog.Header>
            <ConfirmDialog.Title>Undo this run?</ConfirmDialog.Title>
            <ConfirmDialog.Description>
              Restores every memory this run merged, archived or expired.
            </ConfirmDialog.Description>
          </ConfirmDialog.Header>
          <ConfirmDialog.Footer>
            <ConfirmDialog.Cancel className="text-muted" />
            <ConfirmDialog.Action
              onClick={async () => {
                try {
                  await undoRun({ runId });
                  setConfirmOpen(false);
                  toast.success("Run undone");
                } catch (err) {
                  toast.error(convexErrorMessage(err, "Undo failed"));
                }
              }}
              pendingLabel="Undoing…"
              spinnerSize={14}
            >
              Undo run
            </ConfirmDialog.Action>
          </ConfirmDialog.Footer>
        </ConfirmDialog.Content>
      </ConfirmDialog.Root>
    </>
  );
}

function RunsLoadingSkeleton() {
  return (
    <Card className="shadow-none">
      <CardContent className="space-y-1 p-2">
        {[0, 1, 2, 3].map((index) => (
          <Skeleton
            key={index}
            className="h-11 rounded-lg bg-surface-tertiary/40"
          />
        ))}
      </CardContent>
    </Card>
  );
}

function EmptyState() {
  return (
    <Card className="shadow-none">
      <CardContent className="flex flex-col items-center justify-center px-6 py-14 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-lg bg-surface-tertiary/60">
          <IconMoon size={28} className="text-muted" stroke={1.5} />
        </div>
        <h3 className="mb-1 text-base font-medium text-foreground text-balance">
          No dream runs yet
        </h3>
        <p className="max-w-sm text-sm text-muted text-balance">
          Each night vmem merges duplicates and archives stale browsing history.
          Every change shows here and can be undone for 30 days.
        </p>
      </CardContent>
    </Card>
  );
}
