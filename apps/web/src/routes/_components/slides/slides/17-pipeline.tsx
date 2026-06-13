import type { ReactNode } from "react";
import { IconCheck, IconSparkles } from "@tabler/icons-react";
import { motion } from "motion/react";
import ClaudeLogo from "@/components/settings/ClaudeLogo";
import { LinearIcon, SharePointIcon } from "@/components/brand-icons";
import { VmemDrawInIcon } from "@/components/svg-animations";
import { BlurWordsTitle } from "../_components/BlurWordsTitle";
import {
  SlideItem,
  SlideKicker,
  SlideReveal,
  SlideShell,
  SlideStagger,
} from "../_components/SlideShell";

/**
 * Before/after tool-call transcript, styled like Claude's tool-use blocks:
 * each external call is a card with the real product logo, a mono function
 * line, and a result note; "Reasoning" rows pulse between calls. Without
 * vmem Claude chains three tools and re-reasons after each; with vmem one
 * memory call returns the same data already connected and reasoned over.
 */

function ReasoningRow() {
  return (
    <div className="flex items-center gap-2 pl-4">
      <span className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="h-1 w-1 rounded-full bg-muted"
            animate={{ opacity: [0.25, 1, 0.25] }}
            transition={{
              duration: 1.2,
              repeat: Infinity,
              delay: i * 0.18,
              ease: "easeInOut",
            }}
          />
        ))}
      </span>
      <span className="text-xs italic text-muted">Reasoning…</span>
    </div>
  );
}

interface ToolCallCardProps {
  icon: ReactNode;
  call: string;
  /** Plain result note, or a node (e.g. inline-logo list) for richer output. */
  result: ReactNode;
}

/** A Claude-style tool-use block: logo, mono call line, result note. */
function ToolCallCard({ icon, call, result }: ToolCallCardProps) {
  return (
    <div className="rounded-xl bg-surface-secondary/60 px-3.5 py-2.5">
      <div className="flex items-center gap-2.5">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-surface">
          {icon}
        </span>
        <code className="font-mono text-[13px] text-foreground">{call}</code>
      </div>
      <div className="mt-1 pl-[34px] text-xs text-muted">{result}</div>
    </div>
  );
}

/** Small inline logo used inside a result note. */
function ResultLogo({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-3.5 w-3.5 items-center">{children}</span>
  );
}

function AnswerCard({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl bg-foreground px-4 py-3">
      <IconCheck size={16} stroke={2} className="shrink-0 text-background" />
      <p className="text-[13px] font-medium text-background">{children}</p>
    </div>
  );
}

function ColumnHeader({ label, body }: { label: string; body: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted">
        {label}
      </p>
      <p className="mt-1.5 min-h-[3rem] text-sm leading-snug text-muted">
        {body}
      </p>
    </div>
  );
}

/** Claude header row that opens each transcript column. */
function ClaudeRow() {
  return (
    <div className="flex items-center gap-2.5 py-1">
      <ClaudeLogo className="h-5 w-5 text-[#D97757]" />
      <span className="text-sm font-medium text-foreground">Claude</span>
      <span className="text-xs text-muted">received your prompt</span>
    </div>
  );
}

export function Slide17Pipeline() {
  return (
    <SlideShell>
      <SlideReveal delay={0}>
        <SlideKicker>Why it matters</SlideKicker>
      </SlideReveal>
      <BlurWordsTitle lines={["One call, not five."]} size="xl" />

      <div className="mt-6 grid grid-cols-2 gap-10">
        {/* BEFORE — three tools, re-fetched and re-reasoned every prompt */}
        <SlideStagger
          className="flex flex-col gap-2"
          staggerChildren={0.3}
          step={1}
        >
          <SlideItem>
            <ColumnHeader
              label="Before — without vmem"
              body="Claude pieces the data together and reasons over it again on every single prompt."
            />
          </SlideItem>
          <SlideItem>
            <ClaudeRow />
          </SlideItem>
          <SlideItem>
            <ToolCallCard
              icon={<LinearIcon size={16} />}
              call={'linear_search("Q3 roadmap")'}
              result="14 issues fetched"
            />
          </SlideItem>
          <SlideItem>
            <ReasoningRow />
          </SlideItem>
          <SlideItem>
            <ToolCallCard
              icon={<SharePointIcon size={16} />}
              call={'sharepoint_get("Q3 PRD.docx")'}
              result="1 document fetched"
            />
          </SlideItem>
          <SlideItem>
            <ReasoningRow />
          </SlideItem>
          <SlideItem>
            <ToolCallCard
              icon={
                <IconSparkles
                  size={15}
                  stroke={1.5}
                  className="text-foreground"
                />
              }
              call={'eva_query("tender history")'}
              result="6 records fetched"
            />
          </SlideItem>
          <SlideItem>
            <ReasoningRow />
          </SlideItem>
          <SlideItem>
            <AnswerCard>Final answer — rebuilt from scratch</AnswerCard>
          </SlideItem>
        </SlideStagger>

        {/* AFTER — one memory call, already connected, already reasoned over */}
        <SlideStagger
          className="flex flex-col gap-2"
          staggerChildren={0.3}
          step={2}
        >
          <SlideItem>
            <ColumnHeader
              label="After — with vmem"
              body="One call to memory returns the Linear, SharePoint, and Eva data already connected and already reasoned over."
            />
          </SlideItem>
          <SlideItem>
            <ClaudeRow />
          </SlideItem>
          <SlideItem>
            <ToolCallCard
              icon={<VmemDrawInIcon size={16} className="text-foreground" />}
              call={'memory_retrieve("Q3 context")'}
              result={
                <span className="inline-flex flex-wrap items-center gap-1.5">
                  <ResultLogo>
                    <LinearIcon size={14} />
                  </ResultLogo>
                  Linear
                  <span className="text-muted/50">·</span>
                  <ResultLogo>
                    <SharePointIcon size={14} />
                  </ResultLogo>
                  SharePoint
                  <span className="text-muted/50">·</span>
                  <ResultLogo>
                    <IconSparkles
                      size={13}
                      stroke={1.5}
                      className="text-foreground"
                    />
                  </ResultLogo>
                  Eva — one graph, already connected
                </span>
              }
            />
          </SlideItem>
          <SlideItem>
            <ReasoningRow />
          </SlideItem>
          <SlideItem>
            <AnswerCard>Final answer — straight from memory</AnswerCard>
          </SlideItem>
        </SlideStagger>
      </div>
    </SlideShell>
  );
}
