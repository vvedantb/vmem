import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { motion } from "motion/react";
import { IconCheck } from "@tabler/icons-react";
import ClaudeLogo from "@/components/settings/ClaudeLogo";
import { BlurWordsTitle } from "../_components/BlurWordsTitle";
import {
  SlideKicker,
  SlideReveal,
  SlideShell,
} from "../_components/SlideShell";

/**
 * Same question, two assistants, one memory layer: Claude and ChatGPT side by
 * side, each making the identical vmem `memory_retrieve` tool call and giving
 * the identical curated answer. Both reveal in sync on a loop so it reads as
 * "same memory → same result, whichever model you use". Each window uses its
 * provider's own dark palette. All mock data.
 */

// Cycle timeline (ms from the start of each loop), shared by both windows.
const TOOL_AT = 1100; // tool-call block reveals
const ANSWER_AT = 2300; // curated answer reveals
const HOLD_UNTIL = 5600; // dwell on the full exchange
const LOOP_AT = HOLD_UNTIL + 400; // reset + restart

const USER_TEXT =
  "Remind me — what have we sorted for my Japan trip, and what did I love last time?";

/**
 * Same facts, two voices. The retrieved memory is identical — only the
 * model's writing style differs, which is the realistic outcome.
 */

/** Claude: a measured, flowing paragraph. */
function ClaudeAnswer({ color }: { color: string }) {
  return (
    <p className="text-[13px] leading-relaxed" style={{ color }}>
      You&rsquo;re going for a week in March —{" "}
      <span style={{ fontWeight: 600 }}>Tokyo, then Kyoto</span>. The Shinjuku
      hotel and a Kyoto ryokan are booked, and you noted to grab a Suica card
      for the metro. Last time you loved the ramen in Shibuya, and you prefer a
      window seat on the flight.
    </p>
  );
}

/** ChatGPT: a quick summary line, then tidy labelled bullets. */
function ChatGptAnswer({ color }: { color: string }) {
  return (
    <div className="space-y-1.5 text-[13px] leading-relaxed" style={{ color }}>
      <p>
        Quick recap of your{" "}
        <span style={{ fontWeight: 600 }}>March Japan trip</span>:
      </p>
      <ul className="space-y-1">
        {[
          ["Route", "a week — Tokyo, then Kyoto."],
          [
            "Booked",
            "Shinjuku hotel + a Kyoto ryokan; still grab a Suica card.",
          ],
          [
            "Last time",
            "you loved the ramen in Shibuya — and prefer a window seat.",
          ],
        ].map(([label, rest]) => (
          <li key={label} className="flex gap-1.5">
            <span aria-hidden>•</span>
            <span>
              <span style={{ fontWeight: 600 }}>{label}:</span> {rest}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface Palette {
  bg: string;
  bubble: string;
  border: string;
  toolBg: string;
  text: string;
  muted: string;
  accent: string;
}

// Claude.ai dark palette.
const CLAUDE: Palette = {
  bg: "#262624",
  bubble: "#34332F",
  border: "#3E3D39",
  toolBg: "#1F1E1D",
  text: "#ECEAE3",
  muted: "#A6A299",
  accent: "#D97757",
};

// ChatGPT dark palette.
const CHATGPT: Palette = {
  bg: "#212121",
  bubble: "#303030",
  border: "#3B3B3B",
  toolBg: "#2A2A2A",
  text: "#ECECEC",
  muted: "#9B9B9B",
  accent: "#10A37F",
};

/** OpenAI / ChatGPT mark (monochrome — coloured via `color`). */
function ChatGptLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 256 260"
      className={className}
      aria-hidden
      fill="currentColor"
    >
      <path d="M239.184 106.203a64.716 64.716 0 0 0-5.576-53.103C219.452 28.459 191 15.784 163.213 21.74A65.586 65.586 0 0 0 52.096 45.22a64.716 64.716 0 0 0-43.23 31.36c-14.31 24.602-11.061 55.634 8.033 76.74a64.665 64.665 0 0 0 5.525 53.102c14.174 24.65 42.644 37.324 70.446 31.36a64.72 64.72 0 0 0 48.754 21.744c28.481.025 53.714-18.361 62.414-45.481a64.767 64.767 0 0 0 43.229-31.36c14.137-24.558 10.875-55.423-8.083-76.483Zm-97.56 136.338a48.397 48.397 0 0 1-31.105-11.255l1.535-.87 51.67-29.825a8.595 8.595 0 0 0 4.247-7.367v-72.85l21.845 12.636c.218.111.37.32.409.563v60.367c-.056 26.818-21.783 48.545-48.601 48.601Zm-104.466-44.61a48.345 48.345 0 0 1-5.781-32.589l1.534.921 51.722 29.826a8.339 8.339 0 0 0 8.441 0l63.181-36.425v25.221a.87.87 0 0 1-.358.665l-52.335 30.184c-23.257 13.398-52.97 5.431-66.404-17.803ZM23.549 85.38a48.499 48.499 0 0 1 25.58-21.333v61.39a8.288 8.288 0 0 0 4.195 7.316l62.874 36.272-21.845 12.636a.819.819 0 0 1-.767 0L41.353 151.53c-23.211-13.454-31.171-43.144-17.804-66.405v.256Zm179.466 41.695-63.08-36.63L161.73 77.86a.819.819 0 0 1 .768 0l52.233 30.184a48.6 48.6 0 0 1-7.316 87.635v-61.391a8.544 8.544 0 0 0-4.4-7.213Zm21.742-32.69-1.535-.922-51.619-30.081a8.39 8.39 0 0 0-8.492 0L99.98 99.808V74.587a.716.716 0 0 1 .307-.665l52.233-30.133a48.652 48.652 0 0 1 72.236 50.391v.205ZM88.061 139.097l-21.845-12.585a.87.87 0 0 1-.41-.614V65.685a48.652 48.652 0 0 1 79.757-37.346l-1.535.87-51.67 29.825a8.595 8.595 0 0 0-4.246 7.367l-.051 72.697Zm11.868-25.58 28.138-16.217 28.188 16.218v32.434l-28.086 16.218-28.188-16.218-.052-32.434Z" />
    </svg>
  );
}

/** vmem tool-use block, themed to the host provider. */
function ToolUseBlock({ p }: { p: Palette }) {
  return (
    <div
      className="rounded-xl px-3.5 py-2.5"
      style={{ background: p.toolBg, border: `1px solid ${p.border}` }}
    >
      <div className="flex items-center gap-2">
        <img
          src="/icon.png"
          alt="vmem"
          className="h-4 w-4 rounded"
          draggable={false}
        />
        <span className="text-[12px] font-medium" style={{ color: p.text }}>
          vmem
        </span>
        <span
          className="truncate font-mono text-[11px]"
          style={{ color: p.muted }}
        >
          memory_retrieve(&quot;Japan trip&quot;)
        </span>
        <IconCheck
          size={13}
          className="ml-auto shrink-0"
          style={{ color: p.accent }}
        />
      </div>
      <p className="mt-1.5 pl-[26px] text-[11px]" style={{ color: p.muted }}>
        3 memories · connected, reasoned over
      </p>
    </div>
  );
}

interface ProviderWindowProps {
  name: string;
  avatar: ReactNode;
  palette: Palette;
  /** The model's answer, in its own voice. */
  answer: ReactNode;
  phase: number;
}

/** One assistant's chat window, revealing in step with the shared `phase`. */
function ProviderWindow({
  name,
  avatar,
  palette: p,
  answer,
  phase,
}: ProviderWindowProps) {
  const reveal = (show: boolean) => ({
    initial: false as const,
    animate: { opacity: show ? 1 : 0, y: show ? 0 : 8 },
    transition: { duration: 0.4, ease: [0.4, 0, 0.2, 1] as const },
  });

  return (
    <div
      className="flex flex-col gap-3.5 rounded-2xl p-5"
      style={{ background: p.bg }}
    >
      {/* Provider label */}
      <div
        className="flex items-center gap-2 border-b pb-3"
        style={{ borderColor: p.border }}
      >
        {avatar}
        <span className="text-[13px] font-medium" style={{ color: p.text }}>
          {name}
        </span>
      </div>

      {/* User message — identical prompt */}
      <div className="flex justify-end">
        <div
          className="max-w-[88%] rounded-2xl px-3.5 py-2 text-[13px] leading-relaxed"
          style={{ background: p.bubble, color: p.text }}
        >
          {USER_TEXT}
        </div>
      </div>

      {/* Assistant reply: vmem tool call, then the curated answer */}
      <div className="flex gap-2.5">
        <span className="mt-0.5 shrink-0">{avatar}</span>
        <div className="min-w-0 flex-1 space-y-2.5">
          <motion.div {...reveal(phase >= 1)}>
            <ToolUseBlock p={p} />
          </motion.div>
          <motion.div {...reveal(phase >= 2)}>{answer}</motion.div>
        </div>
      </div>
    </div>
  );
}

export function Slide39ClaudeChat() {
  // Shared phase: 0 = prompt only, 1 = + tool call, 2 = + answer. Loops.
  const [phase, setPhase] = useState(0);
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
    const run = () => {
      setPhase(0);
      at(() => setPhase(1), TOOL_AT);
      at(() => setPhase(2), ANSWER_AT);
      at(run, LOOP_AT);
    };
    run();
    return () => {
      cancelled = true;
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, []);

  return (
    <SlideShell>
      <SlideReveal delay={0}>
        <SlideKicker>Claude or ChatGPT</SlideKicker>
      </SlideReveal>
      <BlurWordsTitle lines={["Same memory, same result."]} size="xl" />

      <SlideReveal className="mt-6 grid grid-cols-2 gap-6">
        <ProviderWindow
          name="Claude"
          avatar={<ClaudeLogo className="h-5 w-5 shrink-0 text-[#D97757]" />}
          palette={CLAUDE}
          answer={<ClaudeAnswer color={CLAUDE.text} />}
          phase={phase}
        />
        <ProviderWindow
          name="ChatGPT"
          avatar={<ChatGptLogo className="h-5 w-5 shrink-0 text-white" />}
          palette={CHATGPT}
          answer={<ChatGptAnswer color={CHATGPT.text} />}
          phase={phase}
        />
      </SlideReveal>
    </SlideShell>
  );
}
