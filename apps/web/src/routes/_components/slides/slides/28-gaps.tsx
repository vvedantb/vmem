import {
  IconUnlink,
  IconPlugConnectedX,
  IconRepeatOff,
} from "@tabler/icons-react";
import type { ComponentType } from "react";
import { BlurWordsTitle } from "../_components/BlurWordsTitle";
import {
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

interface Gap {
  icon: ComponentType<IconProps>;
  title: string;
  body: string;
}

const GAPS: Gap[] = [
  {
    icon: IconUnlink,
    title: "No relations between memories",
    body: "Each memory sits alone — there is no sense of how one connects to another.",
  },
  {
    icon: IconPlugConnectedX,
    title: "No link to your data",
    body: "No way to tie memories back to the documents, tools, and sources they came from.",
  },
  {
    icon: IconRepeatOff,
    title: "No routine processing",
    body: "Memories are stored once and left static — never revisited, refined, or reorganised.",
  },
];

export function Slide28Gaps() {
  return (
    <SlideShell>
      <SlideReveal delay={0}>
        <SlideKicker>The gaps</SlideKicker>
      </SlideReveal>
      <BlurWordsTitle lines={["Where they fall short."]} size="xl" />

      <SlideStagger
        className="mt-8 grid grid-cols-3 gap-5"
        delayChildren={0.06}
        staggerChildren={0.13}
        step={1}
      >
        {GAPS.map(({ icon: Icon, title, body }) => (
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
        <p className="text-lg leading-relaxed text-foreground/80">
          The result: a flat pile of notes — not a memory that{" "}
          <span className="font-medium text-foreground">understands</span> how
          things relate.
        </p>
      </SlideReveal>
    </SlideShell>
  );
}
