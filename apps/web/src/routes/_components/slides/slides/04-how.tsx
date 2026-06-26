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
    body: "Chat, browser saves, file uploads, YouTube transcripts, other apps — everything lands in one place.",
  },
  {
    index: "02",
    icon: IconSparkles,
    title: "Enrich",
    body: "vmem labels each memory with topics, pulls out the people and things you named, and maps how it relates to your other memories.",
  },
  {
    index: "03",
    icon: IconGitFork,
    title: "Connect",
    body: "Related memories link together — same conversation, same topic, or clearly about the same thing. People and topics you mention become links you can follow.",
  },
  {
    index: "04",
    icon: IconMemories,
    title: "Recall",
    body: "When you ask a question, vmem searches by meaning, follows the links, and matches names you used — then shows you which memories it used and why.",
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
          Something you capture becomes a memory. vmem tidies it up and connects
          it to the rest of your data, then hands the full picture back when you
          ask. Nothing sits in a drawer unchanged.
        </SlideBody>
      </SlideReveal>

      <PipelineHowStages stages={stages} />
    </SlideShell>
  );
}
