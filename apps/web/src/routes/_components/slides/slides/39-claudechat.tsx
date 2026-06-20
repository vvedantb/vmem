import type { ReactNode } from "react";
import { IconArrowUp, IconCheck } from "@tabler/icons-react";
import ClaudeLogo from "@/components/settings/ClaudeLogo";
import { BlurWordsTitle } from "../_components/BlurWordsTitle";
import {
  SlideKicker,
  SlideReveal,
  SlideShell,
} from "../_components/SlideShell";

/**
 * A 1:1 mock of the Claude chat app: the user asks a question, Claude makes a
 * tool call to vmem (memory_retrieve), and replies with a curated answer drawn
 * from the retrieved memories. Uses Claude's own dark palette (not the vmem
 * theme tokens) so it reads as the real product. All mock data.
 */

// Claude.ai dark-mode palette (hardcoded — this mimics Claude's UI, not vmem's).
const C = {
  bg: "#262624",
  bubble: "#34332F",
  border: "#3E3D39",
  toolBg: "#1F1E1D",
  text: "#ECEAE3",
  muted: "#A6A299",
  orange: "#D97757",
} as const;

function UserBubble({ children }: { children: ReactNode }) {
  return (
    <div className="flex justify-end">
      <div
        className="max-w-[78%] rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed"
        style={{ background: C.bubble, color: C.text }}
      >
        {children}
      </div>
    </div>
  );
}

/** Claude's tool-use block: vmem mark, the call, and the result. */
function ToolUseBlock() {
  return (
    <div
      className="rounded-xl px-4 py-3"
      style={{ background: C.toolBg, border: `1px solid ${C.border}` }}
    >
      <div className="flex items-center gap-2.5">
        <img
          src="/icon.png"
          alt="vmem"
          className="h-5 w-5 rounded-md"
          draggable={false}
        />
        <span className="text-[13px] font-medium" style={{ color: C.text }}>
          vmem
        </span>
        <span className="font-mono text-[12px]" style={{ color: C.muted }}>
          memory_retrieve(&quot;auth decision for the extension&quot;)
        </span>
        <IconCheck size={14} className="ml-auto" style={{ color: C.orange }} />
      </div>
      <p className="mt-2 pl-[30px] text-[12px]" style={{ color: C.muted }}>
        3 memories · already connected, already reasoned over
      </p>
    </div>
  );
}

export function Slide39ClaudeChat() {
  return (
    <SlideShell>
      <SlideReveal delay={0}>
        <SlideKicker>In your chat</SlideKicker>
      </SlideReveal>
      <BlurWordsTitle lines={["Ask once — it already knows."]} size="xl" />

      {/* The Claude chat window */}
      <SlideReveal className="mt-5 flex justify-center">
        <div
          className="flex w-full max-w-3xl flex-col gap-5 rounded-2xl p-6"
          style={{ background: C.bg }}
        >
          {/* User message */}
          <UserBubble>
            Remind me — what did we decide on auth for the Chrome extension, and
            why?
          </UserBubble>

          {/* Claude reply: tool call, then the curated answer */}
          <div className="flex gap-3">
            <ClaudeLogo className="mt-0.5 h-6 w-6 shrink-0 text-[#D97757]" />
            <div className="min-w-0 flex-1 space-y-3">
              <SlideReveal step={1}>
                <ToolUseBlock />
              </SlideReveal>

              <SlideReveal step={2}>
                <p
                  className="text-[15px] leading-relaxed"
                  style={{ color: C.text }}
                >
                  You moved auth to{" "}
                  <span style={{ fontWeight: 600 }}>Clerk</span>. The
                  extension&rsquo;s MV3 service worker needed token refresh that
                  Auth0 couldn&rsquo;t do under the new manifest — Clerk handles
                  it. You&rsquo;d also logged a standing preference for Clerk
                  over Auth0, and it&rsquo;s wired into the &ldquo;Extension
                  token refresh&rdquo; work.
                </p>
              </SlideReveal>
            </div>
          </div>

          {/* Faux composer for product realism */}
          <div
            className="mt-1 flex items-center justify-between rounded-xl px-4 py-3"
            style={{ background: C.toolBg, border: `1px solid ${C.border}` }}
          >
            <span className="text-[14px]" style={{ color: C.muted }}>
              Reply to Claude…
            </span>
            <span
              className="flex h-7 w-7 items-center justify-center rounded-lg"
              style={{ background: C.orange }}
            >
              <IconArrowUp size={16} className="text-white" />
            </span>
          </div>
        </div>
      </SlideReveal>
    </SlideShell>
  );
}
