// shared error to string helper for background, content, and popup

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
