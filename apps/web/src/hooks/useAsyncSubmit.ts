import { useState } from "react";
import { toastMemoryError } from "@/lib/pricing-modal";

/**
 * wraps async actions with submitting state and toast on failure (opens the V Pro modal on the memory cap).
 * avoids duplicating try/catch in every form handler.
 */
export function useAsyncSubmit() {
  const [submitting, setSubmitting] = useState(false);

  const run = async (fn: () => Promise<void>, fallbackMessage: string) => {
    setSubmitting(true);
    // reset after try because finally bails react compiler for this file.
    // catch swallows errors so this line always runs.
    try {
      await fn();
    } catch (err: unknown) {
      toastMemoryError(err, fallbackMessage);
    }
    setSubmitting(false);
  };

  return { submitting, run };
}
