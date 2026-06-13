import { VmemBrand } from "@/components/VmemBrand";
import { BlurWordsTitle } from "../_components/BlurWordsTitle";
import { SlideReveal, SlideShell } from "../_components/SlideShell";

export function Slide14Questions() {
  return (
    <SlideShell center>
      <BlurWordsTitle lines={["Questions"]} size="4xl" />
      <SlideReveal delay={0.5} className="mt-10">
        <VmemBrand iconSize={28} textClassName="text-2xl" />
      </SlideReveal>
    </SlideShell>
  );
}
