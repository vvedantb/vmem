export const SELECTORS = {
  headerActions: "header .flex.items-center",
  inputField: "[contenteditable='true']",
  conversationTurns: "[data-testid='conversation-turn']",
  messageContent: ".font-claude-message",
  sendButton: "[data-testid='send-button']",
} as const;
