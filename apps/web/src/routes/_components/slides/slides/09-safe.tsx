import {
  IconShieldCheck,
  IconPin,
  IconEyeOff,
  IconClock,
  IconHistoryToggle,
} from "@tabler/icons-react";
import {
  SlideShell,
  SlideKicker,
  SlideTitle,
  SlideBody,
} from "../_components/SlideShell";

const safetyFeatures = [
  {
    icon: IconShieldCheck,
    title: "Proposed updates",
    body: "Conflicts never silently overwrite. vmem surfaces a proposal — you approve or reject. Your memories stay accurate.",
  },
  {
    icon: IconPin,
    title: "Pin",
    body: "Pin a memory to prevent it being modified, suppressed, or altered by Dream Mode reconsolidation.",
  },
  {
    icon: IconEyeOff,
    title: "Suppress",
    body: "Remove a memory from recall without deleting it. Useful when something is wrong or no longer relevant.",
  },
  {
    icon: IconClock,
    title: "Expire",
    body: "Set a time-to-live. Temporary context (meeting prep, sprint notes) vanishes when no longer needed.",
  },
  {
    icon: IconHistoryToggle,
    title: "Audit trail",
    body: "Every memory write, update, and suppression is logged with source, timestamp, and reason.",
  },
];

export function Slide09Safe() {
  return (
    <SlideShell>
      <SlideKicker>Safe by design</SlideKicker>
      <SlideTitle size="xl">You stay in control.</SlideTitle>
      <div className="mt-4 max-w-2xl">
        <SlideBody>
          Memory should not be a black box. vmem gives you a full lifecycle —
          approve, pin, suppress, expire, audit.
        </SlideBody>
      </div>

      <div className="mt-8 grid grid-cols-5 gap-4">
        {safetyFeatures.map(({ icon: Icon, title, body }) => (
          <div
            key={title}
            className="flex flex-col rounded-2xl bg-surface-secondary/60 px-4 py-4"
          >
            <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-xl bg-foreground text-background">
              <Icon size={15} stroke={1.5} />
            </div>
            <p className="mb-1.5 text-sm font-medium text-foreground">
              {title}
            </p>
            <p className="text-[11px] leading-relaxed text-muted">{body}</p>
          </div>
        ))}
      </div>
    </SlideShell>
  );
}
