import { useMemo } from "react";
import { cn } from "@vmem/ui";
import { segmentInputBySkills } from "../_utils/segmentInputBySkills";

export const CHAT_SKILL_INPUT_LAYOUT_CLASS =
  "min-h-11 w-full flex-1 resize-none px-3 py-3 text-sm leading-normal [field-sizing:content]";

interface ChatInputSkillHighlightProps {
  input: string;
  skillNames: ReadonlySet<string>;
}

export function ChatInputSkillHighlight({
  input,
  skillNames,
}: ChatInputSkillHighlightProps) {
  const segments = useMemo(
    () => segmentInputBySkills(input, skillNames),
    [input, skillNames],
  );

  return (
    <div
      aria-hidden
      className={cn(
        CHAT_SKILL_INPUT_LAYOUT_CLASS,
        "pointer-events-none absolute inset-0 z-0 overflow-hidden whitespace-pre-wrap break-words border-0 bg-transparent text-foreground",
      )}
    >
      {segments.map((segment, index) =>
        segment.kind === "skill" ? (
          <span
            key={`${segment.name}-${index}`}
            className="-mx-2.5 -my-1 rounded-full bg-surface-tertiary px-2.5 py-1 text-foreground"
          >
            {segment.text}
          </span>
        ) : (
          <span key={`text-${index}`}>{segment.text}</span>
        ),
      )}
    </div>
  );
}
