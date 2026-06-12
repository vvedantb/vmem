import {
  IconBrandChrome,
  IconDeviceMobile,
  IconPlug,
  IconFileUpload,
  IconBrandYoutube,
  IconHistory,
} from "@tabler/icons-react";
import {
  SlideShell,
  SlideKicker,
  SlideTitle,
  SlideBody,
} from "../_components/SlideShell";

const sources = [
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
    icon: IconPlug,
    title: "MCP / Claude Desktop",
    items: [
      "memory.save, memory.retrieve as MCP tools",
      "Implicit memory via MCP Resources",
      "Skills injected into system prompt",
    ],
  },
  {
    icon: IconFileUpload,
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
      <SlideKicker>Capture everywhere</SlideKicker>
      <SlideTitle size="xl">Memory flows in from every surface.</SlideTitle>

      <div className="mt-8 grid grid-cols-4 gap-4">
        {sources.map(({ icon: Icon, title, items }) => (
          <div
            key={title}
            className="flex flex-col rounded-2xl bg-surface-secondary/60 px-4 py-4"
          >
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-foreground text-background">
              <Icon size={16} stroke={1.5} />
            </div>
            <p className="mb-2 text-sm font-medium text-foreground">{title}</p>
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
        ))}
      </div>

      <div className="mt-6">
        <SlideBody>
          All sources converge in the same graph — no data siloes, no sync to
          manage.
        </SlideBody>
      </div>
    </SlideShell>
  );
}
