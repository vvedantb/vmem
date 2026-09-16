export function validateAgentCallbackSearch(search: Record<string, unknown>) {
  return {
    ticket: typeof search.ticket === "string" ? search.ticket : "",
  };
}
