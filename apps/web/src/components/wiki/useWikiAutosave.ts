import { useCallback, useEffect } from "react";
import { useMutation } from "convex/react";
import { useDebounceCallback } from "usehooks-ts";
import { toast } from "sonner";
import { api } from "@vmem/backend";
import type { Id } from "@vmem/backend";
import { optimisticUpdateWikiContent } from "./_optimisticMutations";

const AUTOSAVE_MS = 800;
const SAVE_TOAST_MS = 2000;

type SavePayload = {
  content: string;
  contentText: string;
  forceSnapshot?: boolean;
};

export function useWikiAutosave(docId: Id<"wikiNodes">) {
  const updateContent = useMutation(
    api.wiki.updateContent,
  ).withOptimisticUpdate(optimisticUpdateWikiContent);

  const debouncedSaveToast = useDebounceCallback(() => {
    toast.success("Saved!");
  }, SAVE_TOAST_MS);

  const debouncedSave = useDebounceCallback(async (payload: SavePayload) => {
    try {
      await updateContent({
        id: docId,
        content: payload.content,
        contentText: payload.contentText,
        forceSnapshot: payload.forceSnapshot,
      });
      if (!payload.forceSnapshot) {
        debouncedSaveToast();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    }
  }, AUTOSAVE_MS);

  const cancelPendingSave = useCallback(() => {
    debouncedSave.cancel();
    debouncedSaveToast.cancel();
  }, [debouncedSave, debouncedSaveToast]);

  const saveNow = useCallback(
    async (payload: SavePayload) => {
      cancelPendingSave();
      try {
        await updateContent({
          id: docId,
          content: payload.content,
          contentText: payload.contentText,
          forceSnapshot: payload.forceSnapshot,
        });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to save");
        throw err;
      }
    },
    [cancelPendingSave, docId, updateContent],
  );

  const queueSave = useCallback(
    (payload: Omit<SavePayload, "forceSnapshot">) => {
      void debouncedSave(payload);
    },
    [debouncedSave],
  );

  useEffect(() => cancelPendingSave, [cancelPendingSave]);

  return { queueSave, saveNow, cancelPendingSave };
}
