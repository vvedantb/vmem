"use client";

import { useEffect, useRef } from "react";
import { useMutation, useQuery } from "convex/react";
import type { Editor } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import type { JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";
import { useDebounceCallback } from "usehooks-ts";
import { toast } from "sonner";
import { api } from "@vmem/backend";
import type { Id } from "@vmem/backend";
import {
  countWords,
  docToPlainText,
  extractHeadings,
  formatWikiDocForClipboard,
} from "./_utils";
import type { OutlineHeading } from "./_utils";

interface WikiEditorProps {
  docId: string | null;
  titleForCopy: string;
  onRegisterCopy: (handler: (() => Promise<void>) | null) => void;
  onHeadingsChange: (headings: OutlineHeading[]) => void;
  onWordCountChange: (count: number) => void;
  /** Bumped whenever the outline pane requests a jump. `n` forces effect re-runs. */
  jumpRequest: { pos: number; n: number };
}

const AUTOSAVE_MS = 800;
const SAVE_TOAST_MS = 2000;

function getMarkdownFromEditor(editor: Editor): string {
  const markdownBucket = editor.storage.markdown;
  if (
    typeof markdownBucket === "object" &&
    markdownBucket !== null &&
    "getMarkdown" in markdownBucket &&
    typeof markdownBucket.getMarkdown === "function"
  ) {
    return markdownBucket.getMarkdown();
  }
  return editor.getText();
}

/**
 * TipTap editor body. Title and actions live in the page header; tree in the sidebar.
 * Autosaves canonical markdown plus a plain-text mirror for Convex search (debounced).
 */
export default function WikiEditor({
  docId,
  titleForCopy,
  onRegisterCopy,
  onHeadingsChange,
  onWordCountChange,
  jumpRequest,
}: WikiEditorProps) {
  const doc = useQuery(api.wiki.getNode, docId ? { id: docId } : "skip");

  const updateContent = useMutation(
    api.wiki.updateContent,
  ).withOptimisticUpdate((localStore, args) => {
    const node = localStore.getQuery(api.wiki.getNode, { id: args.id });
    if (!node) return;
    localStore.setQuery(
      api.wiki.getNode,
      { id: args.id },
      {
        ...node,
        content: args.content,
        contentText: args.contentText,
        updatedAt: Date.now(),
      },
    );
  });

  const loadedDocIdRef = useRef<Id<"wikiNodes"> | null>(null);
  const suppressNextUpdateRef = useRef(false);

  const debouncedSaveToast = useDebounceCallback(() => {
    toast.success("Saved!");
  }, SAVE_TOAST_MS);

  const debouncedSave = useDebounceCallback(
    async (id: Id<"wikiNodes">, markdown: string, jsonDoc: JSONContent) => {
      try {
        await updateContent({
          id,
          content: markdown,
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
    content: "",
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
        debouncedSave(activeId, getMarkdownFromEditor(instance), jsonDoc);
      }
    },
  });

  useEffect(() => {
    if (!editor) return;

    if (doc === null || doc === undefined) {
      if (loadedDocIdRef.current !== null) {
        suppressNextUpdateRef.current = true;
        editor.commands.setContent("");
        loadedDocIdRef.current = null;
        onHeadingsChange([]);
        onWordCountChange(0);
      }
      return;
    }

    if (loadedDocIdRef.current === doc._id) {
      return;
    }

    const markdown = doc.content ?? "";
    suppressNextUpdateRef.current = true;
    editor.commands.setContent(markdown);
    loadedDocIdRef.current = doc._id;
    const jsonDoc = editor.getJSON();
    onHeadingsChange(extractHeadings(jsonDoc));
    onWordCountChange(countWords(docToPlainText(jsonDoc)));
  }, [doc, editor, onHeadingsChange, onWordCountChange]);

  useEffect(() => {
    if (!editor || jumpRequest.n === 0) return;
    editor.commands.focus(jumpRequest.pos);
    const dom = editor.view.domAtPos(jumpRequest.pos);
    const target =
      dom.node instanceof HTMLElement ? dom.node : dom.node.parentElement;
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [editor, jumpRequest]);

  useEffect(() => {
    return () => {
      debouncedSave.cancel();
      debouncedSaveToast.cancel();
    };
  }, [debouncedSave, debouncedSaveToast]);

  useEffect(() => {
    if (!editor) {
      onRegisterCopy(null);
      return;
    }

    onRegisterCopy(async () => {
      const text = formatWikiDocForClipboard(
        titleForCopy,
        getMarkdownFromEditor(editor),
      );
      if (text.length === 0) {
        toast.error("Nothing to copy");
        return;
      }

      try {
        await navigator.clipboard.writeText(text);
        toast.success("Copied to clipboard");
      } catch {
        toast.error("Failed to copy to clipboard");
      }
    });

    return () => onRegisterCopy(null);
  }, [editor, onRegisterCopy, titleForCopy]);

  if (docId === null || docId.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-muted">
          Select or create a document to start writing.
        </p>
      </div>
    );
  }

  if (doc === undefined) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-transparent" />
      </div>
    );
  }

  if (doc === null) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-muted">Document not found.</p>
      </div>
    );
  }

  if (doc.kind !== "document") {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-muted">
          This is a folder. Select a document to edit.
        </p>
      </div>
    );
  }

  return (
    <div className="wiki-editor flex min-h-0 flex-1 flex-col overflow-y-auto scrollbar-thin">
      <EditorContent editor={editor} />
    </div>
  );
}
