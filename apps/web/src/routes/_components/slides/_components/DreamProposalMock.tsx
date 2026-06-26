import { useEffect, useState } from "react";
import type { ComponentType } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@vmem/ui";
import {
  IconAlertTriangle,
  IconGitMerge,
  IconUser,
  IconCheck,
  IconX,
} from "@tabler/icons-react";
import {
  ProposalFieldLabel,
  ProposalShell,
} from "@/components/proposals/ProposalShell";

/**
 * Self-running mock of the real Dream Mode proposals page — same `ProposalShell`,
 * same approve/reject affordance. It cycles through the three things Dream Mode
 * surfaces (a contradiction, a merge, a portrait), approving each in turn, so the
 * audience sees the real interaction and the full breadth. Reuses the real
 * component for a 1:1 look. Mock data.
 */

interface IconProps {
  size?: number;
  stroke?: number;
  className?: string;
}
type TablerIcon = ComponentType<IconProps>;

interface BaseProposal {
  accent: string;
  icon: TablerIcon;
  metaLabel: string;
  title: string;
  reason: string;
  approvedLabel: string;
}
type MockProposal =
  | (BaseProposal & {
      kind: "contradiction";
      current: string;
      proposed: string;
    })
  | (BaseProposal & {
      kind: "merge";
      duplicates: [string, string];
      merged: string;
    })
  | (BaseProposal & { kind: "portrait"; portrait: string });

const PROPOSALS: MockProposal[] = [
  {
    kind: "contradiction",
    accent: "bg-danger",
    icon: IconAlertTriangle,
    metaLabel: "Contradiction found",
    title: "Working arrangement",
    reason:
      "You said you're back in the office full-time, which conflicts with an earlier note that you work from home on Fridays.",
    approvedLabel: "Approved",
    current: "Works from home on Fridays.",
    proposed: "Back in the office full-time.",
  },
  {
    kind: "merge",
    accent: "bg-accent",
    icon: IconGitMerge,
    metaLabel: "Merge proposal",
    title: "Possible duplicate",
    reason: "These two memories look like the same thing.",
    approvedLabel: "Merged",
    duplicates: ["Loved the Rome trip", "Italy was amazing"],
    merged: "Loved the trip to Italy",
  },
  {
    kind: "portrait",
    accent: "bg-surface-tertiary",
    icon: IconUser,
    metaLabel: "Portrait",
    title: "How you work",
    reason: "Built from 40 memories — a quick read on how you work.",
    approvedLabel: "Saved",
    portrait:
      "You lead the marketing team, prefer short updates, and work best in the mornings.",
  },
];

// Loop timeline (ms from the start of each card's cycle).
const CURSOR_IN_AT = 600; // cursor glides onto the Approve button
const CLICK_AT = 1500; // click ripple fires
const APPROVED_AT = 1950; // card flips to its approved state
const NEXT_AT = 3700; // hold on the result, then advance to the next card

/** Classic OS pointer arrow, white-filled to read over the button. */
function Cursor() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      className="drop-shadow-[0_2px_4px_rgba(0,0,0,0.4)]"
      aria-hidden
    >
      <path
        d="M5 3 L5 19 L9.5 14.5 L12.5 21 L15 20 L12 13.5 L18 13.5 Z"
        fill="white"
        stroke="black"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** The type-specific body of a proposal, with an approved treatment. */
function ProposalBody({
  proposal,
  approved,
}: {
  proposal: MockProposal;
  approved: boolean;
}) {
  const reason = (
    <div className="rounded-lg bg-surface-secondary/50 p-3">
      <ProposalFieldLabel>Reason</ProposalFieldLabel>
      <p className="text-sm text-muted">{proposal.reason}</p>
    </div>
  );

  if (proposal.kind === "contradiction") {
    return (
      <>
        {reason}
        <div className="grid grid-cols-2 gap-3">
          <div
            className={`rounded-lg bg-surface-secondary/50 p-3 transition-opacity duration-300 ${
              approved ? "opacity-40" : ""
            }`}
          >
            <ProposalFieldLabel>Current</ProposalFieldLabel>
            <p
              className={`text-sm text-muted ${approved ? "line-through" : ""}`}
            >
              {proposal.current}
            </p>
          </div>
          <div
            className={`rounded-lg bg-surface-secondary/70 p-3 transition-[box-shadow] duration-300 ${
              approved ? "ring-2 ring-success" : ""
            }`}
          >
            <ProposalFieldLabel>
              {approved ? "Kept" : "Proposed"}
            </ProposalFieldLabel>
            <p className="text-sm text-foreground">{proposal.proposed}</p>
          </div>
        </div>
      </>
    );
  }

  if (proposal.kind === "merge") {
    return (
      <>
        {reason}
        <div className="space-y-2">
          <ProposalFieldLabel>Duplicates</ProposalFieldLabel>
          {proposal.duplicates.map((d) => (
            <div
              key={d}
              className={`rounded-lg bg-surface-secondary/50 px-3 py-2 text-sm text-muted transition-opacity duration-300 ${
                approved ? "opacity-40 line-through" : ""
              }`}
            >
              {d}
            </div>
          ))}
          {approved ? (
            <div className="rounded-lg bg-surface-secondary/70 px-3 py-2 text-sm text-foreground ring-2 ring-success">
              {proposal.merged}
            </div>
          ) : null}
        </div>
      </>
    );
  }

  return (
    <>
      {reason}
      <div
        className={`rounded-lg bg-surface-secondary/70 p-3 transition-[box-shadow] duration-300 ${
          approved ? "ring-2 ring-success" : ""
        }`}
      >
        <ProposalFieldLabel>Your portrait</ProposalFieldLabel>
        <p className="text-sm text-foreground">{proposal.portrait}</p>
      </div>
    </>
  );
}

export function DreamProposalMock() {
  const [index, setIndex] = useState(0);
  const [approved, setApproved] = useState(false);
  const [cursorIn, setCursorIn] = useState(false);
  // Bumps each cycle so the ripple remounts and replays.
  const [clickKey, setClickKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const timers: number[] = [];
    const at = (fn: () => void, ms: number) => {
      timers.push(
        window.setTimeout(() => {
          if (!cancelled) fn();
        }, ms),
      );
    };

    const cycle = () => {
      setApproved(false);
      setCursorIn(false);
      at(() => setCursorIn(true), CURSOR_IN_AT);
      at(() => setClickKey((k) => k + 1), CLICK_AT);
      at(() => {
        setApproved(true);
        setCursorIn(false);
      }, APPROVED_AT);
      at(() => {
        setIndex((p) => (p + 1) % PROPOSALS.length);
        cycle();
      }, NEXT_AT);
    };
    cycle();

    return () => {
      cancelled = true;
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, []);

  const proposal = PROPOSALS[index];
  const Icon = proposal.icon;

  return (
    <div className="min-h-[260px] max-w-2xl">
      <AnimatePresence mode="wait">
        <motion.div
          key={index}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
        >
          <ProposalShell
            accentClass={proposal.accent}
            title={proposal.title}
            timestamp={new Date().toISOString()}
            meta={
              <span className="inline-flex items-center gap-1.5">
                <Icon size={14} />
                {proposal.metaLabel}
              </span>
            }
            actions={
              approved ? (
                <span className="inline-flex items-center gap-1.5 rounded-md bg-success/15 px-3 py-1.5 text-sm font-medium text-success">
                  <IconCheck size={14} />
                  {proposal.approvedLabel}
                </span>
              ) : (
                <>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-muted"
                  >
                    <IconX size={14} />
                    Reject
                  </Button>
                  <div className="relative">
                    <Button
                      type="button"
                      size="sm"
                      className="bg-surface text-foreground"
                    >
                      <IconCheck size={14} />
                      Approve
                    </Button>

                    {clickKey > 0 ? (
                      <motion.span
                        key={clickKey}
                        className="pointer-events-none absolute left-1/2 top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-foreground/50"
                        initial={{ scale: 0.4, opacity: 0.7 }}
                        animate={{ scale: 2, opacity: 0 }}
                        transition={{ duration: 0.6, ease: "easeOut" }}
                      />
                    ) : null}

                    {cursorIn ? (
                      <motion.span
                        className="pointer-events-none absolute left-[64%] top-[58%]"
                        initial={{ opacity: 0, x: 26, y: 24 }}
                        animate={{ opacity: 1, x: 0, y: 0 }}
                        transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
                      >
                        <Cursor />
                      </motion.span>
                    ) : null}
                  </div>
                </>
              )
            }
          >
            <ProposalBody proposal={proposal} approved={approved} />
          </ProposalShell>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
