// Free plan hard cap on memories per user. V Pro has no cap.
export const FREE_MEMORY_LIMIT = 500;

// Stable token in the error text so clients can detect the cap.
export const MEMORY_LIMIT_CODE = "memory_limit";

export const MEMORY_LIMIT_MESSAGE = `Memory limit reached (${MEMORY_LIMIT_CODE}). The Free plan allows ${String(FREE_MEMORY_LIMIT)} memories. Upgrade to V Pro for unlimited memories.`;

export function isMemoryLimitMessage(message: string): boolean {
  return message.includes(MEMORY_LIMIT_CODE);
}
