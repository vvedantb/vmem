import { defineContentScript } from "wxt/utils/define-content-script";
import "@/content/linkedin/index";

export default defineContentScript({
  matches: ["https://www.linkedin.com/*"],
  runAt: "document_idle",
  main() {},
});
