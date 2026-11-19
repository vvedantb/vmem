import { defineContentScript } from "wxt/utils/define-content-script";
import "@/content/x/index";

export default defineContentScript({
  matches: ["https://x.com/*", "https://twitter.com/*"],
  runAt: "document_idle",
  main() {},
});
