import { LandingAmbientGraph } from "@/routes/_components/landing/LandingAmbientGraph";
import { VmemBrand } from "@/components/VmemBrand";
import {
  SlideShell,
  SlideTitle,
  SlideBody,
  SlideReveal,
} from "../_components/SlideShell";

export function Slide01Title() {
  return (
    <SlideShell center>
      <LandingAmbientGraph />
      <div className="relative z-10 flex flex-col items-center text-center">
        <SlideReveal delay={0}>
          <VmemBrand iconSize={40} textClassName="text-4xl" className="mb-6" />
        </SlideReveal>
        <SlideReveal delay={0.1}>
          <SlideTitle size="3xl">
            A memory layer
            <br />
            for your AI tools.
          </SlideTitle>
        </SlideReveal>
        <SlideReveal step={1} className="mt-6 max-w-xl">
          <SlideBody>
            One shared memory store for Claude, agents, extensions, and mobile —
            graph-native, queryable, and alive between sessions.
          </SlideBody>
        </SlideReveal>
      </div>

      {/* Footer author credit */}
      <SlideReveal
        step={1}
        delay={0.08}
        className="absolute bottom-10 left-0 right-0 flex justify-center"
      >
        <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted/60">
          Vedant Bhopatrao
        </p>
      </SlideReveal>
    </SlideShell>
  );
}
