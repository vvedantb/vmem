import { VmemBrand } from "@/components/VmemBrand";
import { BlurWordsTitle } from "../_components/BlurWordsTitle";
import { SlideAmbientGraph } from "../_components/SlideAmbientGraph";
import { SlideShell, SlideBody, SlideReveal } from "../_components/SlideShell";

export function Slide01Title() {
  return (
    <SlideShell center>
      {/* Graph lines around the edges, fading out behind the centred title.
          animateDraw = the connectors draw themselves in on slide load. */}
      <SlideAmbientGraph
        animateDraw
        className="[-webkit-mask-image:radial-gradient(ellipse_58%_54%_at_50%_50%,transparent_34%,black_72%)] [mask-image:radial-gradient(ellipse_58%_54%_at_50%_50%,transparent_34%,black_72%)]"
      />
      <div className="relative z-10 flex flex-col items-center text-center">
        <SlideReveal delay={0}>
          <VmemBrand iconSize={40} textClassName="text-4xl" className="mb-6" />
        </SlideReveal>
        <BlurWordsTitle
          lines={["Remember everything", "you tell your AI."]}
          size="3xl"
          delay={0.1}
        />
        <SlideReveal step={1} className="mt-6 max-w-xl">
          <SlideBody>
            vmem captures what you tell Claude, your agents, your extension, and
            your phone — then hands it back, already connected, the next time
            you ask.
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
