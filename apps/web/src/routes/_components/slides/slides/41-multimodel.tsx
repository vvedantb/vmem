import { BlurWordsTitle } from "../_components/BlurWordsTitle";
import { SlideReferences } from "../_components/SlideReferences";
import {
  SlideBody,
  SlideItem,
  SlideKicker,
  SlideReveal,
  SlideShell,
  SlideStagger,
} from "../_components/SlideShell";

/**
 * "The token bill came due" — external market proof that the industry is
 * moving away from betting on a single model. Sets up slide 35 (control the
 * model). Every claim is sourced; publication + date shown on-slide, full
 * URLs kept here and in the speaker note.
 *
 * Sources (read 2026-07-01):
 * - Meta scrapped its usage leaderboard; CTO Andrew Bosworth: "All motion is
 *   not progress." Usage had reached ~73.7T tokens/30 days.
 *   https://michaelparekh.substack.com/p/ai-meta-steps-back-from-ai-tokenmaxxing (15 Jun 2026)
 * - Uber burnt its entire 2026 AI coding-tools budget in ~4 months
 *   (President & COO Andrew Macdonald).
 *   https://fortune.com/2026/05/26/uber-coo-ai-spending-tokens-claude-code/ (26 May 2026)
 * - Coinbase (CEO Brian Armstrong) cut AI spend nearly in half while token use
 *   grew — via routing, caching, and cheaper open-weight models for routine work.
 *   https://finance.yahoo.com/markets/crypto/articles/coinbase-ceo-halved-ai-costs-130000536.html (27 Jun 2026)
 * - Perplexity (CEO Aravind Srinivas) orchestrates ~20 models and picks the
 *   cheapest capable one; "token value per watt per user" decides the winners.
 *   https://x.com/AravSrinivas/status/2070929445251400092
 */

interface Signal {
  company: string;
  takeaway: string;
}

const SIGNALS: Signal[] = [
  {
    company: "Meta",
    takeaway:
      "Hit ~73 trillion tokens a month, then scrapped its usage leaderboard — “all motion is not progress.”",
  },
  {
    company: "Uber",
    takeaway: "Burnt its entire 2026 AI budget in four months.",
  },
  {
    company: "Coinbase",
    takeaway: "Halved its AI spend by routing routine work to cheaper models.",
  },
  {
    company: "Perplexity",
    takeaway: "Runs ~20 models and picks the cheapest one that works.",
  },
];

const REFERENCES = [
  {
    label: "Meta · Michael Parekh, 15 Jun 2026",
    href: "https://michaelparekh.substack.com/p/ai-meta-steps-back-from-ai-tokenmaxxing",
  },
  {
    label: "Uber · Fortune, 26 May 2026",
    href: "https://fortune.com/2026/05/26/uber-coo-ai-spending-tokens-claude-code/",
  },
  {
    label: "Coinbase · Yahoo Finance, 27 Jun 2026",
    href: "https://finance.yahoo.com/markets/crypto/articles/coinbase-ceo-halved-ai-costs-130000536.html",
  },
  {
    label: "Perplexity · @AravSrinivas",
    href: "https://x.com/AravSrinivas/status/2070929445251400092",
  },
];

export function Slide41MultiModel() {
  return (
    <SlideShell>
      <SlideReveal delay={0}>
        <SlideKicker>Why multi-model</SlideKicker>
      </SlideReveal>
      <BlurWordsTitle lines={["The token bill came due."]} size="xl" />

      <SlideReveal delay={0.2} className="mt-4 max-w-2xl">
        <p className="text-lg leading-relaxed text-muted">
          The big companies — the ones paying by the token — are all cutting the
          bill.
        </p>
      </SlideReveal>

      {/* Step 1 — four independent signals from the market */}
      <SlideStagger
        className="mt-8 grid grid-cols-2 gap-4"
        delayChildren={0.06}
        staggerChildren={0.13}
        step={1}
      >
        {SIGNALS.map(({ company, takeaway }) => (
          <SlideItem key={company}>
            <div className="flex h-full flex-col gap-1.5 rounded-2xl bg-surface-secondary/60 px-5 py-4">
              <p className="text-sm font-medium text-foreground">{company}</p>
              <p className="text-sm leading-snug text-muted">{takeaway}</p>
            </div>
          </SlideItem>
        ))}
      </SlideStagger>

      {/* Step 2 — the pattern, tied back to vmem */}
      <SlideReveal step={2} className="mt-7 max-w-3xl">
        <SlideBody>
          Usage isn&rsquo;t slowing and token counts keep climbing — the routine
          work is just routed to{" "}
          <span className="font-medium text-foreground">cheaper models</span>,
          frontier saved for when it counts. The future is{" "}
          <span className="font-medium text-foreground">many models</span>, not
          one — and that only works if your memory travels with you, not the
          model.
        </SlideBody>
      </SlideReveal>

      <SlideReferences className="mt-auto pt-8" items={REFERENCES} />
    </SlideShell>
  );
}
