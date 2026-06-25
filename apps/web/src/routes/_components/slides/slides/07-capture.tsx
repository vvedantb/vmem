import type { ComponentType } from "react";
import { IconBrandChrome, IconDeviceMobile } from "@tabler/icons-react";
import { IconChat, IconFiles } from "@/components/sidebar-icons";
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

interface Source {
  icon: ComponentType<IconProps>;
  title: string;
  items: string[];
}

const sources: Source[] = [
  {
    icon: IconBrandChrome,
    title: "Chrome extension",
    items: [
      "Quick-save any page",
      "Auto-sync browsing history",
      "YouTube transcript extraction",
    ],
  },
  {
    icon: IconDeviceMobile,
    title: "Mobile app",
    items: [
      "Voice becomes a memory",
      "Works offline with a model on your phone",
      "Online chat when you have a connection",
    ],
  },
  {
    icon: IconChat,
    title: "Claude & AI assistants",
    items: [
      "Save and search memories from the chat",
      "Background context the assistant reads automatically",
      "Reusable instructions the assistant follows",
    ],
  },
  {
    icon: IconFiles,
    title: "File uploads",
    items: [
      "PDFs and text files become searchable memories",
      "Saved in the cloud, labeled and linked like everything else",
      "Shows up when you search or ask later",
    ],
  },
];

export function Slide07Capture() {
  return (
    <SlideShell>
      <SlideReveal delay={0}>
        <SlideKicker>Capture everywhere</SlideKicker>
      </SlideReveal>
      <BlurWordsTitle lines={["Your data, captured as memories."]} size="xl" />

      <SlideStagger
        className="mt-8 grid grid-cols-4 gap-4"
        delayChildren={0.07}
        step={1}
      >
        {sources.map(({ icon: Icon, title, items }) => (
          <SlideItem key={title}>
            <div className="flex flex-col rounded-2xl bg-surface-secondary/60 px-4 py-4">
              <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-foreground text-background">
                <Icon size={16} stroke={1.5} />
              </div>
              <p className="mb-2 text-sm font-medium text-foreground">
                {title}
              </p>
              <ul className="space-y-1.5">
                {items.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-foreground/30" />
                    <span className="text-[11px] leading-relaxed text-muted">
                      {item}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </SlideItem>
        ))}
      </SlideStagger>

      <SlideReveal step={2} className="mt-6">
        <SlideBody>
          Pages, voice, chat, files — one memory store. Capture once; every app
          can recall it.
        </SlideBody>
      </SlideReveal>
    </SlideShell>
  );
}
