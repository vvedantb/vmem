import { bootstrapAiChatPlatform } from "@/content/shared/ai-chat-bootstrap";
import { injectCopyPromptButton } from "./copy-system-prompt";
import { SELECTORS } from "./selectors";

bootstrapAiChatPlatform({
  platform: "chatgpt",
  selectors: SELECTORS,
  focus: "before",
  injectCopyPromptButton,
});
