import { useContext, useEffect, useRef, type ReactNode } from "react";
import { IconCheck } from "@tabler/icons-react";
import { motion } from "motion/react";
import { motionDuration, motionEase } from "@vmem/ui";
import ClaudeLogo from "@/components/settings/ClaudeLogo";
import { EvaIcon, LinearIcon, SharePointIcon } from "@/components/brand-icons";
import { VmemDrawInIcon } from "@/components/svg-animations";
import { BlurWordsTitle } from "../_components/BlurWordsTitle";
import {
  SlideKicker,
  SlideReveal,
  SlideShell,
  SlideStepContext,
} from "../_components/SlideShell";

/** Fixed chat window height — both columns match. */
const CHAT_HEIGHT_PX = 352;
/** Must match SlideStagger props on each column. */
const STAGGER_DELAY_S = 0.45;
const STAGGER_GAP_S = 0.9;

/**
 * Before/after tool-call transcript inside Claude.ai-style chat windows: dark
 * palette, user bubble on the right, assistant column with tool-use blocks.
 */

const USER_PROMPT = "What's the status of our Q3 roadmap?";

const CLAUDE = {
  bg: "#262624",
  bubble: "#34332F",
  border: "#3E3D39",
  toolBg: "#1F1E1D",
  text: "#ECEAE3",
  muted: "#A6A299",
  accent: "#D97757",
};

function ReasoningRow() {
  return (
    <div className="flex items-center gap-2 py-0.5">
      <span className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="h-1 w-1 rounded-full"
            style={{ background: CLAUDE.muted }}
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
      <span className="text-[12px] italic" style={{ color: CLAUDE.muted }}>
        Reasoning…
      </span>
    </div>
  );
}

interface ToolCallCardProps {
  icon: ReactNode;
  serviceName: string;
  call: string;
  result: ReactNode;
}

/** Claude.ai tool-use block: logo, service name, mono call, check, result line. */
function ToolCallCard({ icon, serviceName, call, result }: ToolCallCardProps) {
  return (
    <div
      className="rounded-xl px-3.5 py-2.5"
      style={{
        background: CLAUDE.toolBg,
        border: `1px solid ${CLAUDE.border}`,
      }}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center">
          {icon}
        </span>
        <span
          className="shrink-0 text-[12px] font-medium"
          style={{ color: CLAUDE.text }}
        >
          {serviceName}
        </span>
        <span
          className="truncate font-mono text-[11px]"
          style={{ color: CLAUDE.muted }}
        >
          {call}
        </span>
        <IconCheck
          size={13}
          className="ml-auto shrink-0"
          style={{ color: CLAUDE.accent }}
        />
      </div>
      <div
        className="mt-1.5 pl-[26px] text-[11px] leading-relaxed"
        style={{ color: CLAUDE.muted }}
      >
        {result}
      </div>
    </div>
  );
}

function AssistantAnswer({ children }: { children: ReactNode }) {
  return (
    <p
      className="pt-1 text-[13px] leading-relaxed"
      style={{ color: CLAUDE.text }}
    >
      {children}
    </p>
  );
}

function ColumnHeader({ label, body }: { label: string; body: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted">
        {label}
      </p>
      <p className="mt-1.5 min-h-[2.75rem] text-sm leading-snug text-muted">
        {body}
      </p>
    </div>
  );
}

/** Stagger on mount — SlideStagger step={0} skips animation (already "show"). */
function PipelineMountStagger({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      animate="show"
      variants={{
        hidden: {},
        show: {
          transition: {
            staggerChildren: STAGGER_GAP_S,
            delayChildren: STAGGER_DELAY_S,
          },
        },
      }}
    >
      {children}
    </motion.div>
  );
}

/** Fade-up child — collapsed while hidden so scroll height grows with each reveal. */
function PipelineStaggerItem({
  children,
  isFirst = false,
  className = "",
}: {
  children: ReactNode;
  isFirst?: boolean;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      variants={{
        hidden: { opacity: 0, height: 0, marginTop: 0, overflow: "hidden" },
        show: {
          opacity: 1,
          height: "auto",
          marginTop: isFirst ? 0 : 8,
          overflow: "visible",
        },
      }}
      transition={{ duration: motionDuration.base, ease: motionEase }}
    >
      {children}
    </motion.div>
  );
}

/** Scroll only when content overflows; always pin to top until then. */
function scrollToFollow(scrollEl: HTMLDivElement, innerEl: HTMLElement) {
  const maxScroll = innerEl.scrollHeight - scrollEl.clientHeight;
  if (maxScroll <= 0) {
    scrollEl.scrollTop = 0;
    return;
  }
  scrollEl.scrollTo({ top: maxScroll, behavior: "smooth" });
}

/** Scrollable assistant thread — smooth-scrolls in sync with stagger reveals. */
function ScrollableAssistantThread({
  children,
  revealStep,
  itemCount,
}: {
  children: ReactNode;
  revealStep: number;
  itemCount: number;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const step = useContext(SlideStepContext);

  useEffect(() => {
    if (step < revealStep) return;

    const scrollEl = scrollRef.current;
    const innerEl = innerRef.current;
    if (!scrollEl || !innerEl) return;

    scrollEl.scrollTop = 0;

    const timers: number[] = [];
    for (let i = 0; i < itemCount; i++) {
      const delayMs = (STAGGER_DELAY_S + i * STAGGER_GAP_S) * 1000;
      timers.push(
        window.setTimeout(() => scrollToFollow(scrollEl, innerEl), delayMs),
      );
    }

    const observer = new ResizeObserver(() =>
      scrollToFollow(scrollEl, innerEl),
    );
    observer.observe(innerEl);

    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      observer.disconnect();
    };
  }, [step, revealStep, itemCount]);

  return (
    <div
      ref={scrollRef}
      className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <div ref={innerRef} className="flex gap-2.5 pr-0.5">
        <ClaudeLogo className="mt-0.5 h-5 w-5 shrink-0 text-[#D97757]" />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}

/** Claude chat chrome — header, user bubble, scrollable assistant thread. */
function ClaudeChatWindow({
  children,
  revealStep,
  itemCount,
}: {
  children: ReactNode;
  revealStep: number;
  itemCount: number;
}) {
  return (
    <div
      className="mt-3 flex flex-col gap-3 overflow-hidden rounded-2xl p-4"
      style={{ background: CLAUDE.bg, height: CHAT_HEIGHT_PX }}
    >
      <div
        className="flex shrink-0 items-center gap-2 border-b pb-3"
        style={{ borderColor: CLAUDE.border }}
      >
        <ClaudeLogo className="h-5 w-5 shrink-0 text-[#D97757]" />
        <span
          className="text-[13px] font-medium"
          style={{ color: CLAUDE.text }}
        >
          Claude
        </span>
      </div>

      <div className="flex shrink-0 justify-end">
        <div
          className="max-w-[92%] rounded-2xl px-3.5 py-2 text-[13px] leading-relaxed"
          style={{ background: CLAUDE.bubble, color: CLAUDE.text }}
        >
          {USER_PROMPT}
        </div>
      </div>

      <ScrollableAssistantThread revealStep={revealStep} itemCount={itemCount}>
        {children}
      </ScrollableAssistantThread>
    </div>
  );
}

/** Small inline logo used inside a tool result note. */
function ResultLogo({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-3.5 w-3.5 items-center">{children}</span>
  );
}

/** Right column — mounts at step 1 so stagger + scroll start from the top. */
function AfterThread() {
  const step = useContext(SlideStepContext);
  if (step < 1) return null;

  return (
    <PipelineMountStagger>
      <PipelineStaggerItem isFirst>
        <ToolCallCard
          icon={<VmemDrawInIcon size={16} className="text-[#ECEAE3]" />}
          serviceName="vmem"
          call={"recalling everything on Q3"}
          result={
            <span className="inline-flex flex-wrap items-center gap-1.5">
              <ResultLogo>
                <LinearIcon size={14} />
              </ResultLogo>
              Linear
              <span style={{ color: CLAUDE.muted, opacity: 0.5 }}>·</span>
              <ResultLogo>
                <SharePointIcon size={14} />
              </ResultLogo>
              SharePoint
              <span style={{ color: CLAUDE.muted, opacity: 0.5 }}>·</span>
              <ResultLogo>
                <EvaIcon size={14} className="rounded-[3px]" />
              </ResultLogo>
              Eva — one graph, already connected
            </span>
          }
        />
      </PipelineStaggerItem>
      <PipelineStaggerItem>
        <ReasoningRow />
      </PipelineStaggerItem>
      <PipelineStaggerItem>
        <AssistantAnswer>
          Here&rsquo;s the Q3 status — straight from memory, already reasoned
          over.
        </AssistantAnswer>
      </PipelineStaggerItem>
    </PipelineMountStagger>
  );
}

export function Slide17Pipeline() {
  return (
    <SlideShell>
      <SlideReveal delay={0}>
        <SlideKicker>Why it matters</SlideKicker>
      </SlideReveal>
      <BlurWordsTitle lines={["One call, not five."]} size="xl" />

      <div className="mt-5 grid grid-cols-2 gap-6">
        {/* BEFORE — three tools, re-fetched and re-reasoned every prompt */}
        <div>
          <ColumnHeader
            label="Before — without vmem"
            body="Claude pieces the data together and reasons over it again on every single prompt."
          />
          <ClaudeChatWindow revealStep={0} itemCount={7}>
            <PipelineMountStagger>
              <PipelineStaggerItem isFirst>
                <ToolCallCard
                  icon={<LinearIcon size={16} />}
                  serviceName="Linear"
                  call={"searching the roadmap"}
                  result="14 items found"
                />
              </PipelineStaggerItem>
              <PipelineStaggerItem>
                <ReasoningRow />
              </PipelineStaggerItem>
              <PipelineStaggerItem>
                <ToolCallCard
                  icon={<SharePointIcon size={16} />}
                  serviceName="SharePoint"
                  call={"opening the Q3 plan"}
                  result="1 document found"
                />
              </PipelineStaggerItem>
              <PipelineStaggerItem>
                <ReasoningRow />
              </PipelineStaggerItem>
              <PipelineStaggerItem>
                <ToolCallCard
                  icon={<EvaIcon size={16} className="rounded" />}
                  serviceName="Eva"
                  call={"checking past tenders"}
                  result="6 records found"
                />
              </PipelineStaggerItem>
              <PipelineStaggerItem>
                <ReasoningRow />
              </PipelineStaggerItem>
              <PipelineStaggerItem>
                <AssistantAnswer>
                  Here&rsquo;s the Q3 status — rebuilt from scratch across three
                  sources.
                </AssistantAnswer>
              </PipelineStaggerItem>
            </PipelineMountStagger>
          </ClaudeChatWindow>
        </div>

        {/* AFTER — one memory call, already connected, already reasoned over */}
        <div>
          <ColumnHeader
            label="After — with vmem"
            body="One call to memory returns the Linear, SharePoint, and Eva data already connected and already reasoned over."
          />
          <ClaudeChatWindow revealStep={1} itemCount={3}>
            <AfterThread />
          </ClaudeChatWindow>
        </div>
      </div>
    </SlideShell>
  );
}
