import { IconCapture, IconSparkles, IconGitFork } from "@tabler/icons-react";
import { IconMemories } from "@/components/sidebar-icons";
import { BlurWordsTitle } from "../_components/BlurWordsTitle";
import {
  PipelineHowStages,
  type PipelineStage,
} from "../_components/PipelineHowStages";
import {
  SlideShell,
  SlideKicker,
  SlideBody,
  SlideReveal,
} from "../_components/SlideShell";

const stages: PipelineStage[] = [
  {
    index: "01",
    icon: IconCapture,
    title: "Capture",
    body: "Chat, browser, files, voice — all in one place.",
  },
  {
    index: "02",
    icon: IconSparkles,
    title: "Enrich",
    body: "Labels topics, pulls out names, finds connections.",
  },
  {
    index: "03",
    icon: IconGitFork,
    title: "Connect",
    body: "Related memories link up automatically.",
  },
  {
    index: "04",
    icon: IconMemories,
    title: "Recall",
    body: "Ask, and get the full picture back — with sources.",
  },
];

export function Slide04How() {
  return (
    <SlideShell>
      <SlideReveal delay={0}>
        <SlideKicker>How it works</SlideKicker>
      </SlideReveal>
      <BlurWordsTitle lines={["Four steps, start to finish."]} size="xl" />
      <SlideReveal delay={0.1} className="mt-8">
        <SlideBody className="text-foreground">
          Capture once — vmem does the rest.
        </SlideBody>
      </SlideReveal>

      <PipelineHowStages stages={stages} />
    </SlideShell>
  );
}
