import {
  IconPlugConnected,
  IconDeviceMobile,
  IconBrandChrome,
  IconTerminal2,
} from "@tabler/icons-react";
import {
  SlideShell,
  SlideKicker,
  SlideTitle,
  SlideBody,
} from "../_components/SlideShell";

const surfaces = [
  { icon: IconTerminal2, label: "MCP / Claude" },
  { icon: IconBrandChrome, label: "Chrome extension" },
  { icon: IconDeviceMobile, label: "Mobile app" },
  { icon: IconPlugConnected, label: "HTTP API" },
];

export function Slide03What() {
  return (
    <SlideShell>
      <SlideKicker>What vmem is</SlideKicker>
      <SlideTitle>
        Graph-native memory,
        <br />
        shared across everything.
      </SlideTitle>
      <div className="mt-8 max-w-2xl">
        <SlideBody>
          vmem is a memory layer that sits between you and your AI tools.
          Memories are stored as nodes in a graph — tagged, entity-linked, and
          semantically embedded — so every tool shares the same contextual
          foundation.
        </SlideBody>
      </div>

      <div className="mt-10 flex gap-4">
        {surfaces.map(({ icon: Icon, label }) => (
          <div
            key={label}
            className="flex items-center gap-2.5 rounded-2xl bg-surface-secondary/60 px-4 py-3"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-foreground text-background">
              <Icon size={16} stroke={1.5} />
            </div>
            <span className="text-sm font-medium text-foreground/80">
              {label}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-2xl bg-surface-secondary/40 px-6 py-5">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">
          One memory store
        </p>
        <p className="mt-2 text-sm leading-relaxed text-foreground/75">
          Any tool that writes a memory enriches the graph for every other tool.
          Claude knows what your extension saved. Your agent knows what you told
          your phone.
        </p>
      </div>
    </SlideShell>
  );
}
