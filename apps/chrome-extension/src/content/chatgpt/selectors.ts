export const SELECTORS = {
  headerActions: "header .flex.items-center.gap-2",
  inputField: "#prompt-textarea",
  conversationTurns: "[data-testid^='conversation-turn']",
  messageContent: ".markdown",
  sendButton: "[data-testid='send-button']",
} as const;
