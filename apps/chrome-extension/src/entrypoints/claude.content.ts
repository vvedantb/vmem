import { defineContentScript } from "wxt/utils/define-content-script";
import "@/content/claude/index";

export default defineContentScript({
  matches: ["https://claude.ai/*"],
  main() {},
});
