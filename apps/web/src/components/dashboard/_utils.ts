// pull the memory title out of descriptions like `Created "My title"`
export function getActivityLabel(description: string): string {
  const quoted = /"([^"]+)"/.exec(description);
  const title = quoted?.at(1);
  if (title !== undefined) return title;
  return description;
}
