// shared error → string coercion used across background/content/popup

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
