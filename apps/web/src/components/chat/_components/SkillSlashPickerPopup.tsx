"use client";

import type { Doc } from "@vmem/backend";
import type { MentionPopupPlacement } from "../_utils/mentionPopupPosition";
import { ChatSkillSlashMenu } from "./ChatSkillSlashMenu";

interface SkillSlashPickerPopupProps {
  placement: MentionPopupPlacement;
  skills: Doc<"skills">[] | undefined;
  filteredSkills: Doc<"skills">[];
  highlightIndex: number;
  onSelect: (skill: Doc<"skills">) => void;
}

export function SkillSlashPickerPopup({
  placement,
  skills,
  filteredSkills,
  highlightIndex,
  onSelect,
}: SkillSlashPickerPopupProps) {
  return (
    <div
      role="listbox"
      aria-label="Skills"
      className="fixed z-50 overflow-hidden rounded-lg bg-overlay text-overlay-foreground shadow-lg animate-in fade-in-0 zoom-in-95 duration-150"
      style={{
        left: placement.left,
        top: placement.top,
        width: placement.width,
        maxHeight: placement.maxHeight,
        transform:
          placement.placement === "above" ? "translateY(-100%)" : undefined,
      }}
    >
      <ChatSkillSlashMenu
        skills={skills}
        filteredSkills={filteredSkills}
        highlightIndex={highlightIndex}
        onSelect={onSelect}
      />
    </div>
  );
}
