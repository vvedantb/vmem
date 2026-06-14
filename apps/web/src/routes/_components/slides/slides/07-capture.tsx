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
      "Voice capture → transcript → memory",
      "Local LLM (GGUF) for offline use",
      "Cloud chat via OpenRouter",
    ],
  },
  {
    icon: IconChat,
    title: "MCP / Claude Desktop",
    items: [
      "memory.save, memory.retrieve as MCP tools",
      "Implicit memory via MCP Resources",
      "Skills injected into system prompt",
    ],
  },
  {
    icon: IconFiles,
    title: "File uploads",
    items: [
      "PDF, text — indexed as memories",
      "Stored in Convex, embedded & enriched",
      "Appears in graph and recall",
    ],
  },
];

export function Slide07Capture() {
  return (
    <SlideShell>
      <SlideReveal delay={0}>
        <SlideKicker>Capture everywhere</SlideKicker>
      </SlideReveal>
      <BlurWordsTitle
        lines={["Memory flows in from every surface."]}
        size="xl"
      />

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
          All sources converge in the same graph — no data siloes, no sync to
          manage.
        </SlideBody>
      </SlideReveal>
    </SlideShell>
  );
}
