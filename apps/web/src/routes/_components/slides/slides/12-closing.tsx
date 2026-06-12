import { LandingAmbientGraph } from "@/routes/_components/landing/LandingAmbientGraph";
import {
  IconArrowRight,
  IconPlug,
  IconBolt,
  IconMapPin,
} from "@tabler/icons-react";
import { BlurWordsTitle } from "../_components/BlurWordsTitle";
import {
  SlideShell,
  SlideKicker,
  SlideBody,
  SlideReveal,
  SlideStagger,
  SlideItem,
} from "../_components/SlideShell";

const roadmapItems = [
  {
    icon: IconPlug,
    title: "Connectors",
    body: "Ingest from Notion, GitHub, Linear, Gmail — structured data flowing into the graph automatically.",
  },
  {
    icon: IconBolt,
    title: "Richer recall",
    body: "Multi-hop graph traversal, temporal decay, relevance feedback from agents.",
  },
  {
    icon: IconMapPin,
    title: "Memory API v2",
    body: "Scoped tokens, per-agent memory namespaces, read-only access grants.",
  },
];

export function Slide12Closing() {
  return (
    <SlideShell>
      <LandingAmbientGraph />
      <div className="relative z-10 flex h-full gap-16">
        <div className="flex flex-1 flex-col justify-center">
          <SlideReveal delay={0}>
            <SlideKicker>What&apos;s next</SlideKicker>
          </SlideReveal>
          <BlurWordsTitle
            lines={["The memory layer", "is just getting started."]}
          />
          <SlideReveal step={1} className="mt-6 max-w-lg">
            <SlideBody>
              vmem is live. The foundation — graph storage, hybrid recall,
              Context Trace, Dream Mode, workspaces — is in place. Connectors
              and richer recall are next.
            </SlideBody>
          </SlideReveal>
          <SlideReveal step={1} delay={0.08} className="mt-8">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground/60">
              <span>vmem.app</span>
              <IconArrowRight size={14} stroke={1.5} />
              <span>try it now</span>
            </div>
          </SlideReveal>
        </div>

        <SlideStagger
          className="flex w-[360px] shrink-0 flex-col justify-center gap-4"
          delayChildren={0.07}
          step={2}
        >
          {roadmapItems.map(({ icon: Icon, title, body }) => (
            <SlideItem key={title}>
              <div className="flex gap-4 rounded-2xl bg-surface-secondary/60 px-5 py-4">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-foreground text-background">
                  <Icon size={15} stroke={1.5} />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted">
                    {body}
                  </p>
                </div>
              </div>
            </SlideItem>
          ))}
        </SlideStagger>
      </div>
    </SlideShell>
  );
}
