/** Narrows a caught value at the catch boundary. */
export function toError(caught: unknown): Error {
  return caught instanceof Error ? caught : new Error(String(caught));
}
