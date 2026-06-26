import type { ComponentType } from "react";
import { IconUser } from "@tabler/icons-react";
import type { SidebarIconProps } from "@/components/sidebar-icons/BaseIcon";
import {
  IconTeams,
  IconSkills,
  IconWiki,
  IconFiles,
} from "@/components/sidebar-icons";
import { BlurWordsTitle } from "../_components/BlurWordsTitle";
import {
  SlideShell,
  SlideKicker,
  SlideBody,
  SlideReveal,
} from "../_components/SlideShell";

interface SharedContentItem {
  icon: ComponentType<SidebarIconProps>;
  label: string;
  desc: string;
}

const sharedContent: SharedContentItem[] = [
  {
    icon: IconSkills,
    label: "Skills",
    desc: "Reusable instructions any AI session can follow.",
  },
  {
    icon: IconWiki,
    label: "Wiki",
    desc: "A shared knowledge base your AI can read.",
  },
  {
    icon: IconFiles,
    label: "Files",
    desc: "Shared files, searchable as memories and available to your AI.",
  },
];

export function Slide10Workspaces() {
  return (
    <SlideShell>
      <SlideReveal delay={0}>
        <SlideKicker>Workspaces &amp; teams</SlideKicker>
      </SlideReveal>
      <BlurWordsTitle lines={["Personal and shared memory."]} size="xl" />
      <SlideReveal delay={0.08} className="mt-6 max-w-2xl">
        <SlideBody>
          Each workspace keeps its own memories. Teams share skills, wiki, and
          files — your personal memories stay private.
        </SlideBody>
      </SlideReveal>

      <div className="mt-10 flex gap-8">
        <SlideReveal
          step={1}
          className="flex-1 rounded-2xl bg-surface-secondary/60 px-6 py-5"
        >
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-foreground text-background">
              <IconUser size={15} stroke={1.5} />
            </div>
            <p className="text-sm font-medium text-foreground">
              Personal workspace
            </p>
          </div>
          <ul className="space-y-2">
            {[
              "Private memories",
              "Personal skills and wiki",
              "Own chat threads",
              "Syncs to browser and phone",
            ].map((item) => (
              <li
                key={item}
                className="flex items-center gap-2 text-xs text-muted"
              >
                <span className="h-1 w-1 shrink-0 rounded-full bg-foreground/30" />
                {item}
              </li>
            ))}
          </ul>
        </SlideReveal>

        <SlideReveal
          step={1}
          delay={0.07}
          className="flex-1 rounded-2xl bg-surface-secondary/60 px-6 py-5"
        >
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-foreground text-background">
              <IconTeams size={15} stroke={1.5} />
            </div>
            <p className="text-sm font-medium text-foreground">
              Team workspace
            </p>
          </div>
          <ul className="space-y-2">
            {[
              "Shared memories for all members",
              "Team-wide skills and wiki",
              "Shared file drive (10 GB)",
              "Any member can create + edit",
            ].map((item) => (
              <li
                key={item}
                className="flex items-center gap-2 text-xs text-muted"
              >
                <span className="h-1 w-1 shrink-0 rounded-full bg-foreground/30" />
                {item}
              </li>
            ))}
          </ul>
        </SlideReveal>

        <SlideReveal
          step={2}
          className="flex-1 rounded-2xl bg-surface-secondary/40 px-6 py-5"
        >
          <p className="mb-4 text-xs font-medium uppercase tracking-[0.18em] text-muted">
            Team-scoped content
          </p>
          <div className="space-y-3">
            {sharedContent.map(({ icon: Icon, label, desc }) => (
              <div key={label} className="flex items-start gap-3">
                <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-foreground text-background">
                  <Icon size={12} stroke={1.5} />
                </div>
                <div>
                  <p className="text-xs font-medium text-foreground">{label}</p>
                  <p className="text-[11px] leading-relaxed text-muted">
                    {desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </SlideReveal>
      </div>
    </SlideShell>
  );
}
