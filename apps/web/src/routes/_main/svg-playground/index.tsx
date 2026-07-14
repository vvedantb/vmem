import { createFileRoute } from "@tanstack/react-router";
import PageContainer from "@/components/PageContainer";
import { ActionSection } from "./_components/ActionSection";
import { AestheticSection } from "./_components/AestheticSection";
import { HoverSection } from "./_components/HoverSection";
import { IdleSection } from "./_components/IdleSection";
import { IntroSection } from "./_components/IntroSection";
import { LoadingSection } from "./_components/LoadingSection";

// /svg-playground — internal demo page for the vmem logo motion library
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
