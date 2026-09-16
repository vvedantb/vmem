import { defineContentScript } from "wxt/utils/define-content-script";
import { startPageConvexTokenMint } from "@/content/clerk-token-sync/page-mint";

export default defineContentScript({
  matches: ["https://vmem.vedantb.com/*"],
  runAt: "document_idle",
  world: "MAIN",
  allFrames: false,
  main() {
    startPageConvexTokenMint();
  },
});
