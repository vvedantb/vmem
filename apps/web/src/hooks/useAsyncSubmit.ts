import { useState } from "react";
import { toast } from "sonner";

/**
 * Owns the submitting flag plus the try/catch/toast boilerplate around a
 * fire-and-forget async action (form submit, delete confirm, etc).
 *
 * Usage:
 *   const { submitting, run } = useAsyncSubmit();
 *   run(async () => {
 *     await someMutation(...);
 *     toast.success("...");
 *     onClose();
 *   }, "Failed to do the thing");
 */
export function useAsyncSubmit() {
  const [submitting, setSubmitting] = useState(false);

  const run = async (fn: () => Promise<void>, fallbackMessage: string) => {
    setSubmitting(true);
    // The reset sits after the try rather than in a `finally`: React Compiler
    // bails on the whole file when it meets a `finally` clause. The catch
    // swallows, so control always reaches the line below.
    try {
      await fn();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : fallbackMessage);
    }
    setSubmitting(false);
  };

  return { submitting, run };
}
