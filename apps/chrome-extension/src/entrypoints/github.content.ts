import { defineContentScript } from "wxt/utils/define-content-script";
import "@/content/github/index";

export default defineContentScript({
  matches: ["https://github.com/*"],
  runAt: "document_idle",
  main() {},
});
