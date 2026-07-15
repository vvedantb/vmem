import { defineContentScript } from "wxt/utils/define-content-script";
import "@/content/youtube/index";

export default defineContentScript({
  matches: ["https://www.youtube.com/*", "https://youtube.com/*"],
  runAt: "document_idle",
  main() {
    // initialized via side-effect import
  },
});
