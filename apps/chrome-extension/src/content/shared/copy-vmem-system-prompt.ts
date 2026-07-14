import {
  VMEM_AI_SYSTEM_PROMPT,
  VMEM_AI_SYSTEM_PROMPT_COPY_SUCCESS,
} from "@/lib/constants";
import { copyTextToClipboard } from "@/lib/copy-to-clipboard";
import { showToast } from "@/content/shared/toast";

// copy the shared vmem system prompt and toast success/failure
export function copyVmemSystemPrompt(): void {
  void copyTextToClipboard(VMEM_AI_SYSTEM_PROMPT).then((copied) => {
    if (copied) {
      showToast({
        type: "success",
        message: VMEM_AI_SYSTEM_PROMPT_COPY_SUCCESS,
      });
      return;
    }
    showToast({
      type: "error",
      message: "Could not copy to clipboard",
    });
  });
}
