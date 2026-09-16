export const OPENROUTER_REQUIRED = "openrouter_required";

export class OpenRouterRequiredError extends Error {
  readonly code = OPENROUTER_REQUIRED;

  constructor() {
    super(OPENROUTER_REQUIRED);
    this.name = "OpenRouterRequiredError";
  }
}

export function isOpenRouterRequiredError(error: unknown): boolean {
  return (
    error instanceof OpenRouterRequiredError ||
    (error instanceof Error && error.message === OPENROUTER_REQUIRED)
  );
}

export function openRouterRequiredResponse(): Response {
  return Response.json({ error: OPENROUTER_REQUIRED }, { status: 422 });
}
