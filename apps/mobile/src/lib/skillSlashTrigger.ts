export interface SlashTrigger {
  isOpen: boolean;
  query: string;
  startIndex: number;
}

/** A "/" only triggers at message start or after whitespace, with no whitespace typed after it yet. */
export function isValidSlashTrigger(
  value: string,
  slashIndex: number,
): boolean {
  const textAfter = value.slice(slashIndex + 1);
  if (textAfter.includes("\n") || /\s/.test(textAfter)) return false;
  const charBefore = slashIndex > 0 ? value[slashIndex - 1] : "";
  return (
    slashIndex === 0 || (charBefore !== undefined && /\s/.test(charBefore))
  );
}

/**
 * Port of web SkillMentionEditor's trigger detection, operating on the text
 * before the TextInput cursor (`value.slice(0, cursor)`).
 */
export function findSlashTrigger(
  textBeforeCursor: string,
  hasSkills: boolean,
): SlashTrigger | null {
  if (!hasSkills) return null;
  const slashIndex = textBeforeCursor.lastIndexOf("/");
  if (slashIndex === -1 || !isValidSlashTrigger(textBeforeCursor, slashIndex)) {
    return null;
  }
  return {
    isOpen: true,
    query: textBeforeCursor.slice(slashIndex + 1),
    startIndex: slashIndex,
  };
}
