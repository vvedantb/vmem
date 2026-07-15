import { defineContentScript } from "wxt/utils/define-content-script";
import "@/content/chatgpt/index";

export default defineContentScript({
  matches: ["https://chat.openai.com/*", "https://chatgpt.com/*"],
  main() {
    // initialized via side-effect import
  },
});
