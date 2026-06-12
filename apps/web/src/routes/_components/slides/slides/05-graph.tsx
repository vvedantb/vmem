import { LandingMemoryPreview } from "@/routes/_components/landing/LandingMemoryPreview";
import {
  SlideShell,
  SlideKicker,
  SlideTitle,
  SlideBody,
} from "../_components/SlideShell";

export function Slide05Graph() {
  return (
    <SlideShell>
      <div className="flex h-full gap-14">
        <div className="flex flex-1 flex-col justify-center">
          <SlideKicker>Memory graph</SlideKicker>
          <SlideTitle size="xl">Context as a living graph.</SlideTitle>
          <div className="mt-6">
            <SlideBody>
              Memories are nodes. Tags are recurring themes. Entities are named
              specifics — people, projects, tools. Relates-to edges connect
              memories by content, session, and similarity.
            </SlideBody>
          </div>
          <div className="mt-8 space-y-3">
            {[
              [
                "Tags",
                "Recurring themes — generalised vocabulary across all memories.",
              ],
              ["Entities", "Specific names: people, products, repos, APIs."],
              [
                "Edges",
                "Same session, semantic similarity, or LLM-detected relation.",
              ],
            ].map(([label, desc]) => (
              <div key={label} className="flex gap-3">
                <span className="mt-0.5 text-xs font-medium uppercase tracking-[0.18em] text-foreground/50 w-16 shrink-0">
                  {label}
                </span>
                <span className="text-xs leading-relaxed text-muted">
                  {desc}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="flex w-[380px] shrink-0 flex-col justify-center">
          <LandingMemoryPreview />
          <p className="mt-3 text-center text-xs text-muted/60">
            Click a node during the talk.
          </p>
        </div>
      </div>
    </SlideShell>
  );
}
