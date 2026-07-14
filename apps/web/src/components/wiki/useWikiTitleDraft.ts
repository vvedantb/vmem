"use client";

import { useEffect, useState } from "react";
import type { Doc } from "@vmem/backend";
import { toast } from "sonner";

type RenameNode = (args: {
  id: Doc<"wikiNodes">["_id"];
  title: string;
}) => Promise<unknown>;

export function useWikiTitleDraft(
  doc: Doc<"wikiNodes"> | null | undefined,
  renameNode: RenameNode,
) {
  const [titleDraft, setTitleDraft] = useState("");

  useEffect(() => {
    if (doc?.kind !== "document") return;
    setTitleDraft(doc.title);
  }, [doc?._id, doc?.title, doc?.kind]);

  async function commitTitle() {
    if (!doc || doc.kind !== "document") return;
    const trimmed = titleDraft.trim();
    if (trimmed.length === 0 || trimmed === doc.title) {
      setTitleDraft(doc.title);
      return;
    }
    try {
      await renameNode({ id: doc._id, title: trimmed });
      toast.success("Saved!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
      setTitleDraft(doc.title);
    }
  }

  return { titleDraft, setTitleDraft, commitTitle };
}
