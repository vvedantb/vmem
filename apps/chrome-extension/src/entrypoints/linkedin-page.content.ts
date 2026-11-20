import { defineContentScript } from "wxt/utils/define-content-script";
import "@/content/linkedin/page-world";

export default defineContentScript({
  matches: ["https://www.linkedin.com/*"],
  runAt: "document_idle",
  world: "MAIN",
  main() {},
});
