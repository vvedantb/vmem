import { defineContentScript } from "wxt/utils/define-content-script";
import { startClerkSessionCookieSync } from "@/content/clerk-token-sync";

export default defineContentScript({
  matches: ["https://vmem.vedantb.com/*"],
  runAt: "document_idle",
  allFrames: false,
  main() {
    startClerkSessionCookieSync();
  },
});
