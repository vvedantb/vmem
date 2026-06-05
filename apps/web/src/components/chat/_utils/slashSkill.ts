/** Active `/skill-query` at end of input (after start or whitespace). */
export function parseTrailingSlashSkillQuery(
  input: string,
): { replaceStart: number; query: string } | null {
  const match = /(^|\s)\/([^\s]*)$/.exec(input);
  if (!match || match.index === undefined) return null;
  const leading = match[1] ?? "";
  const query = match[2] ?? "";
  return { replaceStart: match.index + leading.length, query };
}

export function applySlashSkillSelection(
  input: string,
  replaceStart: number,
  skillName: string,
): string {
  return `${input.slice(0, replaceStart)}/${skillName} `;
}
