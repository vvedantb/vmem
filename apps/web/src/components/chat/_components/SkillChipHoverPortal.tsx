"use client";

import { createPortal } from "react-dom";
import type { Doc } from "@vmem/backend";
import { SkillChipHoverPreview } from "./SkillChipHoverPreview";

interface SkillChipHoverPortalProps {
  skill: Doc<"skills">;
  anchorRect: DOMRect;
  onMouseLeave: () => void;
}

export function SkillChipHoverPortal({
  skill,
  anchorRect,
  onMouseLeave,
}: SkillChipHoverPortalProps) {
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      data-skill-hover-card="true"
      className="fixed z-50 w-72 pb-3"
      style={{
        left: anchorRect.left,
        top: anchorRect.top - 8,
        transform: "translateY(-100%)",
      }}
      onMouseLeave={onMouseLeave}
    >
      <div className="rounded-lg bg-overlay p-3 text-overlay-foreground shadow-lg">
        <SkillChipHoverPreview skill={skill} />
      </div>
    </div>,
    document.body,
  );
}
