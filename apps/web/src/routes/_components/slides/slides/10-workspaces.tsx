import {
  IconUsers,
  IconUser,
  IconBook,
  IconCode,
  IconFiles,
} from "@tabler/icons-react";
import {
  SlideShell,
  SlideKicker,
  SlideTitle,
  SlideBody,
} from "../_components/SlideShell";

const sharedContent = [
  {
    icon: IconCode,
    label: "Skills",
    desc: "Reusable prompt instructions injected into any AI session.",
  },
  {
    icon: IconBook,
    label: "Wiki",
    desc: "Team knowledge base linked into agent context.",
  },
  {
    icon: IconFiles,
    label: "Files",
    desc: "Shared AI filesystem — indexed as memories, served to agents.",
  },
];

export function Slide10Workspaces() {
  return (
    <SlideShell>
      <SlideKicker>Workspaces &amp; teams</SlideKicker>
      <SlideTitle size="xl">Personal and shared memory.</SlideTitle>
      <div className="mt-6 max-w-2xl">
        <SlideBody>
          Profiles are workspaces. Each workspace has its own memory scope.
          Teams share skills, wiki, and files — personal memories stay private.
        </SlideBody>
      </div>

      <div className="mt-10 flex gap-8">
        <div className="flex-1 rounded-2xl bg-surface-secondary/60 px-6 py-5">
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
              "Syncs to extension + mobile",
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
        </div>

        <div className="flex-1 rounded-2xl bg-surface-secondary/60 px-6 py-5">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-foreground text-background">
              <IconUsers size={15} stroke={1.5} />
            </div>
            <p className="text-sm font-medium text-foreground">
              Team workspace
            </p>
          </div>
          <ul className="space-y-2">
            {[
              "Shared memory scope for all members",
              "Team-wide skills and wiki",
              "Shared file drive (10 GiB)",
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
        </div>

        <div className="flex-1 rounded-2xl bg-surface-secondary/40 px-6 py-5">
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
        </div>
      </div>
    </SlideShell>
  );
}
