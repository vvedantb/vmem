"use client";

import { createPortal } from "react-dom";
import type { Doc } from "@vmem/backend";
import { SkillChipHoverPreview } from "./SkillChipHoverPreview";

interface SkillChipHoverPortalProps {
  skill: Doc<"skills">;
  anchorRect: DOMRect;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

export function SkillChipHoverPortal({
  skill,
  anchorRect,
  onMouseEnter,
  onMouseLeave,
}: SkillChipHoverPortalProps) {
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      data-skill-hover-card="true"
      className="fixed z-50 flex w-72 flex-col-reverse items-stretch"
      style={{
        left: anchorRect.left,
        bottom: window.innerHeight - anchorRect.top,
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="h-3 shrink-0" aria-hidden />
      <SkillChipHoverPreview skill={skill} />
    </div>,
    document.body,
  );
}
