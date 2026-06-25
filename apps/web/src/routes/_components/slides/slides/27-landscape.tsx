import {
  IconSearch,
  IconHierarchy2,
  IconAdjustmentsHorizontal,
} from "@tabler/icons-react";
import type { ComponentType } from "react";
import { BlurWordsTitle } from "../_components/BlurWordsTitle";
import {
  SlideBody,
  SlideItem,
  SlideKicker,
  SlideReveal,
  SlideShell,
  SlideStagger,
} from "../_components/SlideShell";

interface IconProps {
  size?: number;
  stroke?: number;
  className?: string;
}

interface Approach {
  icon: ComponentType<IconProps>;
  title: string;
  body: string;
}

const APPROACHES: Approach[] = [
  {
    icon: IconSearch,
    title: "RAG",
    body: "Retrieve top-k similar chunks by embedding and stuff them into the prompt.",
  },
  {
    icon: IconHierarchy2,
    title: "GraphRAG",
    body: "Build a knowledge graph over the corpus and retrieve across connected nodes.",
  },
  {
    icon: IconAdjustmentsHorizontal,
    title: "Context engineering",
    body: "Curate exactly what enters the window — the right facts, in the right order.",
  },
];

export function Slide27Landscape() {
  return (
    <SlideShell>
      <SlideReveal delay={0}>
        <SlideKicker>The landscape</SlideKicker>
      </SlideReveal>
      <BlurWordsTitle lines={["How memory engines solve this."]} size="xl" />

      <SlideStagger
        className="mt-8 grid grid-cols-3 gap-5"
        delayChildren={0.06}
        staggerChildren={0.13}
        step={1}
      >
        {APPROACHES.map(({ icon: Icon, title, body }) => (
          <SlideItem key={title}>
            <div className="flex h-full flex-col rounded-2xl bg-surface-secondary/60 px-5 py-5">
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-foreground text-background">
                <Icon size={19} stroke={1.5} />
              </div>
              <p className="mb-1.5 text-base font-medium text-foreground">
                {title}
              </p>
              <p className="text-sm leading-relaxed text-muted">{body}</p>
            </div>
          </SlideItem>
        ))}
      </SlideStagger>

      <SlideReveal step={2} className="mt-7 max-w-3xl">
        <SlideBody>
          Models reason well — they fail at finding the relevant information. It
          all comes down to context. Get it right and you improve accuracy{" "}
          <span className="font-medium text-foreground">and</span> cut token
          cost on every response.
        </SlideBody>
      </SlideReveal>
    </SlideShell>
  );
}
