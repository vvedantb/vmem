import { defineContentScript } from "wxt/utils/define-content-script";
import "@/content/readability/index";

export default defineContentScript({
  matches: ["<all_urls>"],
  runAt: "document_idle",
  allFrames: false,
  main() {
    // initialized via side-effect import
  },
});
