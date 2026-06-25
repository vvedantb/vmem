import type { ComponentType } from "react";
import { IconDeviceMobile, IconBrandChrome } from "@tabler/icons-react";
import { IconChat, IconMemories } from "@/components/sidebar-icons";
import { BlurWordsTitle } from "../_components/BlurWordsTitle";
import {
  SlideShell,
  SlideKicker,
  SlideBody,
  SlideReveal,
  SlideStagger,
  SlideItem,
} from "../_components/SlideShell";

/** Minimal icon props that both @tabler/icons-react and sidebar icons satisfy. */
interface IconProps {
  size?: number;
  stroke?: number;
  className?: string;
}

interface Surface {
  icon: ComponentType<IconProps>;
  label: string;
}

const surfaces: Surface[] = [
  { icon: IconChat, label: "AI chat tools" },
  { icon: IconBrandChrome, label: "Chrome extension" },
  { icon: IconDeviceMobile, label: "Mobile app" },
  { icon: IconMemories, label: "Other apps" },
];

export function Slide03What() {
  return (
    <SlideShell>
      <SlideReveal delay={0}>
        <SlideKicker>What vmem does</SlideKicker>
      </SlideReveal>
      <BlurWordsTitle lines={["Capture it once,", "recall it everywhere."]} />
      <SlideReveal step={1} className="mt-8 max-w-2xl">
        <SlideBody>
          You capture something once — a page, a file, something you said in
          chat, voice on your phone. vmem stores it as a memory, labels the
          topic, links the people and things involved, and ties it to what you
          already know. When you ask from another app, you get the full picture
          back.
        </SlideBody>
      </SlideReveal>

      <SlideStagger className="mt-10 flex gap-4" delayChildren={0.06} step={2}>
        {surfaces.map(({ icon: Icon, label }) => (
          <SlideItem key={label}>
            <div className="flex items-center gap-2.5 rounded-2xl bg-surface-secondary/60 px-4 py-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-foreground text-background">
                <Icon size={16} stroke={1.5} />
              </div>
              <span className="text-sm font-medium text-foreground/80">
                {label}
              </span>
            </div>
          </SlideItem>
        ))}
      </SlideStagger>

      <SlideReveal
        step={3}
        className="mt-8 rounded-2xl bg-surface-secondary/40 px-6 py-5"
      >
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">
          One memory store
        </p>
        <p className="mt-2 text-sm leading-relaxed text-foreground/75">
          Capture from one app, recall in another. A page saved in the browser
          shows up when you chat in Claude. Voice on your phone shows up on your
          laptop.
        </p>
      </SlideReveal>
    </SlideShell>
  );
}
