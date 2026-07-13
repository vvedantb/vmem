/**
 * Pill styling for / skill chips (aligned with eva MentionEditor chips).
 * Accent fill keeps chips visible on white field backgrounds.
 */
export const SKILL_CHIP_CLASS =
  "inline-flex items-center rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground";

export const SKILL_CHIP_INTERACTIVE_CLASS =
  "cursor-pointer transition-[background-color] hover:bg-accent/90";

export const EDITOR_CHIP_CLICKABLE_CLASS = SKILL_CHIP_INTERACTIVE_CLASS;
