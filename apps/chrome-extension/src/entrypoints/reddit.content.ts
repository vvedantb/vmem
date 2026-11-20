import { defineContentScript } from "wxt/utils/define-content-script";
import "@/content/reddit/index";

export default defineContentScript({
  matches: ["https://*.reddit.com/*"],
  runAt: "document_idle",
  main() {},
});
