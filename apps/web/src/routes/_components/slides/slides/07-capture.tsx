import type { ComponentType } from "react";
import { IconBrandChrome, IconDeviceMobile } from "@tabler/icons-react";
import { IconChat, IconFiles } from "@/components/sidebar-icons";
import { BlurWordsTitle } from "../_components/BlurWordsTitle";
import { CaptureSourcesPanel } from "../_components/CaptureSourcesPanel";
import {
  SlideShell,
  SlideKicker,
  SlideBody,
  SlideReveal,
} from "../_components/SlideShell";

/** Minimal icon props that both @tabler/icons-react and sidebar icons satisfy. */
interface IconProps {
  size?: number;
  stroke?: number;
  className?: string;
}

interface Source {
  icon: ComponentType<IconProps>;
  title: string;
  items: string[];
}

const sources: Source[] = [
  {
    icon: IconBrandChrome,
    title: "Chrome extension",
    items: [
      "Quick-save any page",
      "Auto-sync browsing history",
      "Save what a YouTube video said",
    ],
  },
  {
    icon: IconDeviceMobile,
    title: "Mobile app",
    items: [
      "Voice becomes a memory",
      "Works offline, right on your phone",
      "Online chat when you have a connection",
    ],
  },
  {
    icon: IconChat,
    title: "Claude & AI assistants",
    items: [
      "Save and search memories from the chat",
      "Background context the assistant reads automatically",
      "Reusable instructions the assistant follows",
    ],
  },
  {
    icon: IconFiles,
    title: "File uploads",
    items: [
      "PDFs and text files become searchable memories",
      "Saved in the cloud, labeled and linked like everything else",
      "Shows up when you search or ask later",
    ],
  },
];

export function Slide07Capture() {
  return (
    <SlideShell>
      <SlideReveal delay={0}>
        <SlideKicker>Capture everywhere</SlideKicker>
      </SlideReveal>
      <BlurWordsTitle lines={["Your data, captured as memories."]} size="xl" />

      <CaptureSourcesPanel sources={sources} />

      <SlideReveal step={2} className="mt-6">
        <SlideBody className="text-foreground">
          Pages, voice, chat, files — one memory store. Capture once; every app
          can recall it.
        </SlideBody>
      </SlideReveal>
    </SlideShell>
  );
}
