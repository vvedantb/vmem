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
    <div className="flex items-center gap-2 py-1 pl-4">
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
  result: string;
}

/** A Claude-style tool-use block: logo, mono call line, result note. */
function ToolCallCard({ icon, call, result }: ToolCallCardProps) {
  return (
    <div className="rounded-xl bg-surface-secondary/60 px-4 py-3">
      <div className="flex items-center gap-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface">
          {icon}
        </span>
        <code className="font-mono text-[13px] text-foreground">{call}</code>
      </div>
      <p className="mt-1.5 pl-[38px] text-xs text-muted">{result}</p>
    </div>
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
      <p className="mt-2 min-h-[3.75rem] text-sm leading-relaxed text-muted">
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

      <div className="mt-8 grid grid-cols-2 gap-10">
        {/* BEFORE — three tools, re-fetched and re-reasoned every prompt */}
        <SlideStagger
          className="flex flex-col gap-2.5"
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
          className="flex flex-col gap-2.5"
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
              result="Linear · SharePoint · Eva — one graph, already connected"
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
