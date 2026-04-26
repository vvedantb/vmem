import { createFileRoute } from "@tanstack/react-router";
import PageContainer from "@/components/PageContainer";
import { ActionSection } from "./_components/ActionSection";
import { AestheticSection } from "./_components/AestheticSection";
import { HoverSection } from "./_components/HoverSection";
import { IdleSection } from "./_components/IdleSection";
import { IntroSection } from "./_components/IntroSection";
import { LoadingSection } from "./_components/LoadingSection";

/**
 * /svg-playground — internal demo page for the vmem logo motion library.
 *
 * Each section corresponds to an animation intent (idle, loading, intro,
 * action, hover, aesthetic). Cards inside a section all use the same
 * underlying logo paths from <VmemPaths>; the difference is which CSS class
 * (or SMIL element) is layered on top.
 *
 * Not linked from the sidebar — open it directly via the URL when picking
 * the next animation to ship into product surfaces.
 */
export const Route = createFileRoute("/_main/svg-playground/")({
  component: SvgPlaygroundPage,
});

function SvgPlaygroundPage() {
  return (
    <PageContainer title="SVG Playground" centeredMaxWidth>
      <div className="space-y-10">
        <IdleSection />
        <LoadingSection />
        <IntroSection />
        <ActionSection />
        <HoverSection />
        <AestheticSection />
      </div>
    </PageContainer>
  );
}
