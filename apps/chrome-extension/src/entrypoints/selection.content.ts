import { defineContentScript } from "wxt/utils/define-content-script";
import "@/content/selection/index";

export default defineContentScript({
  matches: ["<all_urls>"],
  runAt: "document_idle",
  allFrames: true,
  main() {
    // initialized via side-effect import
  },
});
