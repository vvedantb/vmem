import {
  SlideShell,
  SlideKicker,
  SlideBody,
  SlideReveal,
  SlideStagger,
  SlideItem,
} from "../_components/SlideShell";
import { BlurWordsTitle } from "../_components/BlurWordsTitle";
import { ToolLogo } from "../_components/ToolLogos";
import type { ToolKey } from "../_components/ToolLogos";

/**
 * The scatter half of the fragmentation beat (paired with frag-collapse).
 *  step 0 — kicker + title
 *  step 1 — six tool cards stagger in, each holding a real fragment of "you"
 *           (deliberately disconnected — whitespace, no edges between them)
 *  step 2 — the sting line that names the problem
 * The payoff (collapse into one vmem layer) is the next slide.
 */

interface Fragment {
  tool: string;
  logo: ToolKey;
  knows: string;
}

const FRAGMENTS: Fragment[] = [
  {
    tool: "ChatGPT",
    logo: "chatgpt",
    knows: "the tone of voice it learned from your drafts",
  },
  {
    tool: "Claude",
    logo: "claude",
    knows: "your codebase — and that you hate pointless comments",
  },
  {
    tool: "Gemini / Workspace",
    logo: "gemini",
    knows: "every email, doc and meeting you've had",
  },
  {
    tool: "Copilot",
    logo: "copilot",
    knows: "the exact file you're typing in right now",
  },
  {
    tool: "Browser / Perplexity",
    logo: "browser",
    knows: "the 30 tabs you researched that vendor in",
  },
  {
    tool: "Grok",
    logo: "grok",
    knows: "the half-formed ideas you bounced off it at midnight",
  },
];

export function SlideFragmentScatter() {
  return (
    <SlideShell>
      <SlideReveal delay={0}>
        <SlideKicker>You're already fragmented</SlideKicker>
      </SlideReveal>
      <BlurWordsTitle
        lines={["Where does your context actually live?"]}
        size="xl"
      />
      <SlideStagger
        className="mt-10 grid grid-cols-3 gap-5"
        delayChildren={0.06}
        step={1}
      >
        {FRAGMENTS.map(({ tool, logo, knows }) => (
          <SlideItem key={tool}>
            <div className="flex h-full flex-col gap-2 rounded-2xl bg-surface-secondary/60 px-5 py-5">
              <div className="flex items-center gap-2">
                <ToolLogo tool={logo} className="h-4 w-4 shrink-0" />
                <p className="text-sm font-semibold text-foreground">{tool}</p>
              </div>
              <p className="text-xs leading-relaxed text-muted">{knows}</p>
            </div>
          </SlideItem>
        ))}
      </SlideStagger>
      <SlideReveal step={2} className="mt-8">
        <SlideBody>
          Each tool knows a slice of you. None of them know{" "}
          <span className="text-foreground">you</span> — and the moment you
          switch, that slice is gone.
        </SlideBody>
      </SlideReveal>
    </SlideShell>
  );
}
