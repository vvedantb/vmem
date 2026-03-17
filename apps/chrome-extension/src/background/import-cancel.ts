let cancelled = false;

export function cancelImport(): void {
  cancelled = true;
}

export function resetCancel(): void {
  cancelled = false;
}

export function isCancelled(): boolean {
  return cancelled;
}
