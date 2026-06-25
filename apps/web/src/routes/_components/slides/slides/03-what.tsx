import type { ComponentType } from "react";
import { IconDeviceMobile, IconBrandChrome } from "@tabler/icons-react";
import { IconChat, IconMemories } from "@/components/sidebar-icons";
import { BlurWordsTitle } from "../_components/BlurWordsTitle";
import { WhatMemoryFlow } from "../_components/WhatMemoryFlow";
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

interface Surface {
  icon: ComponentType<IconProps>;
  label: string;
}

const surfaces: Surface[] = [
  { icon: IconChat, label: "AI chat tools" },
  { icon: IconBrandChrome, label: "Chrome extension" },
  { icon: IconDeviceMobile, label: "Mobile app" },
  { icon: IconMemories, label: "Other apps" },
];

export function Slide03What() {
  return (
    <SlideShell>
      <SlideReveal delay={0}>
        <SlideKicker>What vmem does</SlideKicker>
      </SlideReveal>
      <BlurWordsTitle lines={["Capture it once,", "recall it everywhere."]} />
      <SlideReveal step={1} className="mt-8 max-w-2xl">
        <SlideBody className="text-foreground">
          You capture something once — a page, a file, something you said in
          chat, voice on your phone. vmem stores it as a memory, labels the
          topic, links the people and things involved, and ties it to what you
          already know. When you ask from another app, you get the full picture
          back.
        </SlideBody>
      </SlideReveal>

      <WhatMemoryFlow sources={surfaces} />
    </SlideShell>
  );
}
