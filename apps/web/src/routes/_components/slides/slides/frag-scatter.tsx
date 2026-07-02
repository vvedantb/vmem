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
 *  step 1 — six cards stagger in (work apps + AI tools), each holding a slice
 *           of your data (deliberately disconnected — no edges between them)
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
    tool: "SharePoint",
    logo: "sharepoint",
    knows: "every doc, spec and policy the team has ever filed",
  },
  {
    tool: "Linear",
    logo: "linear",
    knows: "every ticket, every cycle, and who owns what",
  },
  {
    tool: "Teams",
    logo: "teams",
    knows: "the decisions buried across chats and channels",
  },
  {
    tool: "Notion",
    logo: "notion",
    knows: "the wiki, the specs, the meeting notes",
  },
  {
    tool: "Claude",
    logo: "claude",
    knows: "your codebase — and that you hate pointless comments",
  },
  {
    tool: "ChatGPT",
    logo: "chatgpt",
    knows: "the tone of voice it learned from your drafts",
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
          Every one of these holds a piece of you — and the threads between them
          live in <span className="text-foreground">your head</span>. An agent
          can&rsquo;t see those threads; it stitches the picture back together
          through connectors, bit by bit, every time.
        </SlideBody>
      </SlideReveal>
    </SlideShell>
  );
}
