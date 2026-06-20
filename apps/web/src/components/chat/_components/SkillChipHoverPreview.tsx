/** Eva-aligned shell for skill chip hover previews (border + shadow-lg). */
export const SKILL_CHIP_HOVER_CARD_CLASS =
  "w-72 rounded-lg border border-border bg-overlay p-3 text-overlay-foreground shadow-lg";

interface SkillChipHoverPreviewProps {
  /** Any skill-like value — a personal skill doc or an effective/system skill. */
  skill: { name: string; description?: string; instructions: string };
}

export function SkillChipHoverPreview({ skill }: SkillChipHoverPreviewProps) {
  return (
    <div className={SKILL_CHIP_HOVER_CARD_CLASS}>
      <p className="mb-2 truncate text-xs font-medium text-foreground">
        /{skill.name}
      </p>
      <div className="max-h-60 overflow-y-auto scrollbar-thin text-xs text-muted">
        {skill.description ? (
          <p className="mb-2 whitespace-pre-wrap">{skill.description}</p>
        ) : null}
        <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-foreground">
          {skill.instructions}
        </pre>
      </div>
    </div>
  );
}
