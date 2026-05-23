"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { EditorContent, useEditor } from "@tiptap/react";
import type { JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";
import { useDebounceCallback } from "usehooks-ts";
import { toast } from "sonner";
import { api } from "@vmem/backend";
import type { Doc, Id } from "@vmem/backend";
import WikiBreadcrumb from "./WikiBreadcrumb";
import {
  countWords,
  docToPlainText,
  extractHeadings,
  findAncestors,
} from "./_utils";
import type { OutlineHeading } from "./_utils";

interface WikiEditorProps {
  docId: string | null;
  allNodes: Array<Doc<"wikiNodes">>;
  onHeadingsChange: (headings: OutlineHeading[]) => void;
  onWordCountChange: (count: number) => void;
  /** Bumped whenever the outline pane requests a jump. `n` forces effect re-runs. */
  jumpRequest: { pos: number; n: number };
}

const AUTOSAVE_MS = 800;
const SAVE_TOAST_MS = 2000;

const EMPTY_DOC: JSONContent = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

/**
 * Center-pane TipTap editor. Obsidian-style layout: title input above, content below.
 * Autosaves both TipTap JSON and flattened plain text to Convex (debounced).
 *
 * The editor instance is created once and re-used across document switches —
 * we call `setContent` on the node change. This keeps ProseMirror state stable
 * and avoids re-mounting the contenteditable DOM.
 */
export default function WikiEditor({
  docId,
  allNodes,
  onHeadingsChange,
  onWordCountChange,
  jumpRequest,
}: WikiEditorProps) {
  const doc = useQuery(api.wiki.getNode, docId ? { id: docId } : "skip");

  const updateContent = useMutation(api.wiki.updateContent);
  const renameNode = useMutation(api.wiki.renameNode);

  // Track the id we've already loaded content for, so we only call setContent
  // on actual document switches (not on every Convex live update).
  const loadedDocIdRef = useRef<Id<"wikiNodes"> | null>(null);
  // Track the last content we saved to suppress the onUpdate echo that fires
  // when we call setContent programmatically.
  const suppressNextUpdateRef = useRef(false);

  const [titleDraft, setTitleDraft] = useState<string>("");

  const debouncedSaveToast = useDebounceCallback(() => {
    toast.success("Saved!");
  }, SAVE_TOAST_MS);

  const debouncedSave = useDebounceCallback(
    async (id: Id<"wikiNodes">, jsonDoc: JSONContent) => {
      try {
        await updateContent({
          id,
          contentJson: JSON.stringify(jsonDoc),
          contentText: docToPlainText(jsonDoc),
        });
        debouncedSaveToast();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to save");
      }
    },
    AUTOSAVE_MS,
  );

  const editor = useEditor({
    extensions: [
      StarterKit,
      Markdown.configure({
        html: false,
        transformPastedText: true,
        transformCopiedText: true,
      }),
    ],
    content: EMPTY_DOC,
    // Required to avoid SSR hydration mismatches in Next.js App Router.
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          "max-w-none focus:outline-none min-h-[300px] px-3 py-4 text-[15px] md:px-6 md:py-6",
      },
    },
    onUpdate: ({ editor: instance }) => {
      if (suppressNextUpdateRef.current) {
        suppressNextUpdateRef.current = false;
        return;
      }
      const jsonDoc = instance.getJSON();
      onHeadingsChange(extractHeadings(jsonDoc));
      onWordCountChange(countWords(docToPlainText(jsonDoc)));
      const activeId = loadedDocIdRef.current;
      if (activeId) {
        debouncedSave(activeId, jsonDoc);
      }
    },
  });

  // Load content into the editor when the selected doc changes (or arrives).
  useEffect(() => {
    if (!editor) return;

    if (doc === null || doc === undefined) {
      // No doc or still loading — clear editor if we were previously showing one.
      if (loadedDocIdRef.current !== null) {
        suppressNextUpdateRef.current = true;
        editor.commands.setContent(EMPTY_DOC);
        loadedDocIdRef.current = null;
        onHeadingsChange([]);
        onWordCountChange(0);
        setTitleDraft("");
      }
      return;
    }

    if (loadedDocIdRef.current === doc._id) {
      // Already loaded this doc — don't stomp on user edits.
      return;
    }

    let parsed: JSONContent = EMPTY_DOC;
    if (doc.contentJson && doc.contentJson.length > 0) {
      try {
        const json: JSONContent = JSON.parse(doc.contentJson);
        parsed = json;
      } catch {
        parsed = EMPTY_DOC;
      }
    }
    suppressNextUpdateRef.current = true;
    editor.commands.setContent(parsed);
    loadedDocIdRef.current = doc._id;
    onHeadingsChange(extractHeadings(parsed));
    onWordCountChange(countWords(docToPlainText(parsed)));
    setTitleDraft(doc.title);
  }, [doc, editor, onHeadingsChange, onWordCountChange]);

  // Handle outline jumps.
  useEffect(() => {
    if (!editor || jumpRequest.n === 0) return;
    editor.commands.focus(jumpRequest.pos);
    // Scroll the target heading into view.
    const dom = editor.view.domAtPos(jumpRequest.pos);
    const target =
      dom.node instanceof HTMLElement ? dom.node : dom.node.parentElement;
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [editor, jumpRequest]);

  // Clean up debounce on unmount to avoid firing after navigation.
  useEffect(() => {
    return () => {
      debouncedSave.cancel();
      debouncedSaveToast.cancel();
    };
  }, [debouncedSave, debouncedSaveToast]);

  const ancestors = useMemo(
    () => (doc ? findAncestors(doc, allNodes) : []),
    [doc, allNodes],
  );

  const handleTitleBlur = async () => {
    if (!doc) return;
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
  };

  if (docId === null || docId.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-muted-foreground">
          Select or create a document to start writing.
        </p>
      </div>
    );
  }

  if (doc === undefined) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
      </div>
    );
  }

  if (doc === null) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Document not found.</p>
      </div>
    );
  }

  if (doc.kind !== "document") {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-muted-foreground">
          This is a folder. Select a document to edit.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-0 flex-1">
      <div className="px-3 pt-2 md:px-6 md:pt-4">
        <WikiBreadcrumb ancestors={ancestors} />
        <input
          value={titleDraft}
          onChange={(e) => setTitleDraft(e.target.value)}
          onBlur={() => void handleTitleBlur()}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.currentTarget.blur();
            }
          }}
          placeholder="Untitled"
          aria-label="Document title"
          className="w-full bg-transparent text-2xl md:text-3xl font-instrumentSerif text-foreground outline-none placeholder:text-muted-foreground/50 mt-2"
        />
      </div>
      <div className="wiki-editor flex-1 min-h-0 overflow-y-auto scrollbar-thin">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
