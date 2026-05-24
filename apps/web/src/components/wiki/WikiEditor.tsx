"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { Editor } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import type { JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";
import { useDebounceCallback } from "usehooks-ts";
import { IconCopy, IconDots } from "@tabler/icons-react";
import { toast } from "sonner";
import { api } from "@vmem/backend";
import type { Doc, Id } from "@vmem/backend";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@vmem/ui";
import WikiBreadcrumb from "./WikiBreadcrumb";
import {
  countWords,
  docToPlainText,
  extractHeadings,
  findAncestors,
  formatWikiDocForClipboard,
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
 * Center-pane TipTap editor. Obsidian-style layout: title input above, content below.
 * Autosaves canonical markdown plus a plain-text mirror for Convex search (debounced).
 *
 * Markdown is the stored format (same as eva docs). TipTap is edit-time only.
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

  const loadedDocIdRef = useRef<Id<"wikiNodes"> | null>(null);
  const suppressNextUpdateRef = useRef(false);

  const [titleDraft, setTitleDraft] = useState<string>("");

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
        setTitleDraft("");
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
    setTitleDraft(doc.title);
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

  const ancestors = useMemo(
    () => (doc ? findAncestors(doc, allNodes) : []),
    [doc, allNodes],
  );

  const handleCopy = async () => {
    if (!editor) return;

    const text = formatWikiDocForClipboard(
      titleDraft,
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
  };

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
        <div className="mt-2 flex items-center gap-2">
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
            className="min-w-0 flex-1 bg-transparent text-2xl font-instrumentSerif text-foreground outline-none placeholder:text-muted-foreground/50 md:text-3xl"
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="shrink-0 text-muted-foreground"
                aria-label="Document actions"
              >
                <IconDots size={16} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onSelect={() => {
                  void handleCopy();
                }}
              >
                <IconCopy size={14} />
                Copy
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <div className="wiki-editor flex-1 min-h-0 overflow-y-auto scrollbar-thin">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
