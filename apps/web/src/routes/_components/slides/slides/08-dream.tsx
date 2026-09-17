import { BlurWordsTitle } from "../_components/BlurWordsTitle";
import { DreamProposalMock } from "../_components/DreamProposalMock";
import {
  SlideShell,
  SlideKicker,
  SlideBody,
  SlideReveal,
} from "../_components/SlideShell";

export function Slide08Dream() {
  return (
    <SlideShell>
      <SlideReveal delay={0}>
        <SlideKicker>Dream Mode</SlideKicker>
      </SlideReveal>
      <BlurWordsTitle
        lines={["Your memories get smarter overnight."]}
        size="xl"
      />
      <SlideReveal delay={0.08} className="mt-3 max-w-2xl">
        <SlideBody className="text-base text-foreground">
          While you&rsquo;re away, vmem spots conflicts and duplicates — and
          asks before it changes anything.
        </SlideBody>
      </SlideReveal>

      <SlideReveal step={1} className="mt-6">
        <DreamProposalMock />
      </SlideReveal>

      <SlideReveal step={2} className="mt-4">
        <SlideBody className="text-sm">
          It proposes; you approve or reject — never a silent overwrite.
        </SlideBody>
      </SlideReveal>
    </SlideShell>
  );
}
