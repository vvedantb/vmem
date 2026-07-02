import {
  IconPower,
  IconArrowRight,
  IconRefresh,
  IconShieldCheck,
} from "@tabler/icons-react";
import { BlurWordsTitle } from "../_components/BlurWordsTitle";
import { SlideReferences } from "../_components/SlideReferences";
import {
  SlideItem,
  SlideKicker,
  SlideReveal,
  SlideShell,
  SlideStagger,
} from "../_components/SlideShell";

export function Slide35Sovereignty() {
  return (
    <SlideShell>
      <SlideReveal delay={0}>
        <SlideKicker>The real test</SlideKicker>
      </SlideReveal>
      <BlurWordsTitle
        lines={["Do you control the model,", "or does it control you?"]}
        size="xl"
      />

      {/* Step 1 — the acid test, as a left-to-right scenario */}
      <SlideStagger
        className="mt-8 flex flex-wrap items-stretch gap-3"
        delayChildren={0.06}
        staggerChildren={0.22}
        step={1}
      >
        <SlideItem className="flex-1">
          <div className="flex h-full flex-col gap-2 rounded-2xl bg-surface-secondary/60 px-5 py-4">
            <IconPower size={22} stroke={1.5} className="text-foreground" />
            <p className="text-sm font-medium text-foreground">
              Claude shuts down tomorrow.
            </p>
            <p className="text-xs leading-relaxed text-muted">
              Or doubles its price, or changes its terms.
            </p>
          </div>
        </SlideItem>

        <SlideItem className="flex items-center">
          <IconArrowRight size={20} stroke={1.5} className="text-muted/60" />
        </SlideItem>

        <SlideItem className="flex-1">
          <div className="flex h-full flex-col gap-2 rounded-2xl bg-surface-secondary/60 px-5 py-4">
            <IconRefresh size={22} stroke={1.5} className="text-foreground" />
            <p className="text-sm font-medium text-foreground">
              Swap in another model.
            </p>
            <p className="text-xs leading-relaxed text-muted">
              Same capabilities, no retraining, nothing relearned from scratch.
            </p>
          </div>
        </SlideItem>

        <SlideItem className="flex items-center">
          <IconArrowRight size={20} stroke={1.5} className="text-muted/60" />
        </SlideItem>

        <SlideItem className="flex-1">
          <div className="flex h-full flex-col gap-2 rounded-2xl bg-foreground px-5 py-4 text-background">
            <IconShieldCheck size={22} stroke={1.5} />
            <p className="text-sm font-medium">The expertise stays with you.</p>
            <p className="text-xs leading-relaxed text-background/70">
              Your memories, your IP — held in vmem, not the model.
            </p>
          </div>
        </SlideItem>
      </SlideStagger>

      {/* Step 2 — the quote that frames the whole thesis */}
      <SlideReveal
        step={2}
        className="mt-8 max-w-4xl border-l-2 border-foreground/20 pl-6"
      >
        <p className="font-instrumentSerif text-2xl leading-snug text-foreground">
          “Switch out a <span className="italic">generalist</span> model without
          losing the <span className="italic">company veteran</span> expertise
          built into their learning system.”
        </p>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          That is the key test of your control and sovereignty in the era ahead.
        </p>
        <p className="mt-4 text-sm font-medium text-foreground">
          — Satya Nadella, CEO of Microsoft
        </p>
      </SlideReveal>

      <SlideReferences
        className="mt-auto pt-8"
        items={[
          {
            label: "Satya Nadella · X (@satyanadella)",
            href: "https://x.com/satyanadella/status/2066182223213293753",
          },
        ]}
      />
    </SlideShell>
  );
}
