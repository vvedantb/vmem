import { useEffect } from "react";
import { useMutation } from "convex/react";
import { useDebounceCallback } from "usehooks-ts";
import { toast } from "sonner";
import { api } from "@vmem/backend";
import type { Id } from "@vmem/backend";
const AUTOSAVE_MS = 800;
const SAVE_TOAST_MS = 2000;

type SavePayload = {
  content: string;
  contentText: string;
  forceSnapshot?: boolean;
};

export function useWikiAutosave(docId: Id<"wikiNodes">) {
  const updateContent = useMutation(api.wiki.updateContent);

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

  const cancelPendingSave = () => {
    debouncedSave.cancel();
    debouncedSaveToast.cancel();
  };

  const saveNow = async (payload: SavePayload) => {
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
  };

  const queueSave = (payload: Omit<SavePayload, "forceSnapshot">) => {
    void debouncedSave(payload);
  };

  useEffect(() => {
    return () => {
      debouncedSave.cancel();
      debouncedSaveToast.cancel();
    };
  }, [debouncedSave, debouncedSaveToast]);

  return { queueSave, saveNow, cancelPendingSave };
}
