export function normalizeAccountEmail(
  email: string | undefined | null,
): string | undefined {
  if (email == null) return undefined;
  const normalized = email.trim().toLowerCase();
  return normalized.length === 0 ? undefined : normalized;
}
