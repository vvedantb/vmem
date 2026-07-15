export function validateAgentCallbackSearch(search: { ticket?: string }) {
  return {
    ticket: typeof search.ticket === "string" ? search.ticket : "",
  };
}
