"use client";

import { useCallback, useEffect, useRef } from "react";
import { useMutation, useQuery } from "convex/react";
import type { Editor } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import type { JSONContent } from "@tiptap/react";
import { useDebounceCallback } from "usehooks-ts";
import { toast } from "sonner";
import { api } from "@vmem/backend";
import type { Id } from "@vmem/backend";
import { wikiEditorExtensions } from "./_editorExtensions";
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
  // registers a restore handler the history panel calls with a version's markdown
  onRegisterRestore: (
    handler: ((markdown: string) => Promise<void>) | null,
  ) => void;
  onHeadingsChange: (headings: OutlineHeading[]) => void;
  // reports the heading the reader is currently scrolled to (outline highlight)
  onActiveHeadingChange: (id: string | null) => void;
  onWordCountChange: (count: number) => void;
  // bumped whenever the outline pane requests a jump
  jumpRequest: { pos: number; n: number };
}

const AUTOSAVE_MS = 800;
const SAVE_TOAST_MS = 2000;
// A heading stays "active" until its top scrolls this far below the viewport top
const ACTIVE_OFFSET_PX = 80;

// resolve the heading DOM element for a ProseMirror position (outline scroll-spy)
function resolveHeadingElement(editor: Editor, pos: number): Element | null {
  try {
    const { node } = editor.view.domAtPos(pos);
    const element = node instanceof Element ? node : node.parentElement;
    return element?.closest("h1, h2, h3, h4, h5, h6") ?? null;
  } catch {
    return null;
  }
}

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

// tipTap editor body
export default function WikiEditor({
  docId,
  titleForCopy,
  onRegisterCopy,
  onRegisterRestore,
  onHeadingsChange,
  onActiveHeadingChange,
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
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const headingsRef = useRef<OutlineHeading[]>([]);
  const computeFrameRef = useRef(0);
  const scheduleRef = useRef<() => void>(() => {});

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

  // update the outline's heading list and keep a ref copy for scroll-spy
  const publishHeadings = useCallback(
    (next: OutlineHeading[]) => {
      headingsRef.current = next;
      onHeadingsChange(next);
    },
    [onHeadingsChange],
  );

  // scroll handler reads the latest scheduler via ref — the editor's onUpdate
  // closure is fixed at creation and can't see a fresher useCallback otherwise
  const handleScroll = useCallback(() => {
    scheduleRef.current();
  }, []);

  const editor = useEditor({
    extensions: wikiEditorExtensions(),
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
      publishHeadings(extractHeadings(jsonDoc));
      onWordCountChange(countWords(docToPlainText(jsonDoc)));
      scheduleRef.current();
      const activeId = loadedDocIdRef.current;
      if (activeId) {
        void debouncedSave(activeId, getMarkdownFromEditor(instance), jsonDoc);
      }
    },
  });

  // determine which heading the reader is currently on, from scroll position
  const computeActiveHeading = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!editor || editor.isDestroyed || !container) return;
    const headings = headingsRef.current;
    if (headings.length === 0) {
      onActiveHeadingChange(null);
      return;
    }

    const atBottom =
      container.scrollTop + container.clientHeight >=
      container.scrollHeight - 2;
    const containerTop = container.getBoundingClientRect().top;

    // active = the last heading whose top has scrolled above the offset line
    let firstId: string | null = null;
    let activeId: string | null = null;
    for (const heading of headings) {
      const element = resolveHeadingElement(editor, heading.pos);
      if (!element) continue;
      if (firstId === null) firstId = heading.id;
      const relativeTop = element.getBoundingClientRect().top - containerTop;
      if (relativeTop <= ACTIVE_OFFSET_PX) {
        activeId = heading.id;
      } else {
        break;
      }
    }

    // at the very bottom, a short trailing section never reaches the offset —
    // pin the last heading so it can still become active
    if (atBottom) {
      for (let i = headings.length - 1; i >= 0; i--) {
        const heading = headings[i];
        if (heading && resolveHeadingElement(editor, heading.pos)) {
          activeId = heading.id;
          break;
        }
      }
    }

    // before the first heading is reached, highlight it rather than nothing
    onActiveHeadingChange(activeId ?? firstId);
  }, [editor, onActiveHeadingChange]);

  const scheduleComputeActive = useCallback(() => {
    if (computeFrameRef.current) return;
    computeFrameRef.current = requestAnimationFrame(() => {
      computeFrameRef.current = 0;
      computeActiveHeading();
    });
  }, [computeActiveHeading]);

  // keep the ref the onUpdate/scroll closures call pointed at the latest scheduler
  useEffect(() => {
    scheduleRef.current = scheduleComputeActive;
  }, [scheduleComputeActive]);

  // cancel any queued scroll-spy frame on unmount
  useEffect(() => {
    return () => {
      if (computeFrameRef.current) {
        cancelAnimationFrame(computeFrameRef.current);
        computeFrameRef.current = 0;
      }
    };
  }, []);

  useEffect(() => {
    if (!editor) return;

    if (doc === null || doc === undefined) {
      if (loadedDocIdRef.current !== null) {
        suppressNextUpdateRef.current = true;
        editor.commands.setContent("");
        loadedDocIdRef.current = null;
        publishHeadings([]);
        onWordCountChange(0);
        scheduleComputeActive();
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
    publishHeadings(extractHeadings(jsonDoc));
    onWordCountChange(countWords(docToPlainText(jsonDoc)));
    scheduleComputeActive();
  }, [doc, editor, publishHeadings, onWordCountChange, scheduleComputeActive]);

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

  // restore: load a version's markdown into the editor and persist it with a
  // forced snapshot so the pre-restore state is captured (restore is reversible)
  const restoreToContent = useCallback(
    async (markdown: string) => {
      if (!editor) return;
      const activeId = loadedDocIdRef.current;
      if (!activeId) return;
      debouncedSave.cancel(); // we persist this write explicitly, not via autosave
      suppressNextUpdateRef.current = true;
      editor.commands.setContent(markdown);
      const jsonDoc = editor.getJSON();
      publishHeadings(extractHeadings(jsonDoc));
      onWordCountChange(countWords(docToPlainText(jsonDoc)));
      scheduleComputeActive();
      try {
        await updateContent({
          id: activeId,
          content: getMarkdownFromEditor(editor),
          contentText: docToPlainText(jsonDoc),
          forceSnapshot: true,
        });
        toast.success("Version restored");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to restore");
      }
    },
    [
      editor,
      updateContent,
      debouncedSave,
      publishHeadings,
      onWordCountChange,
      scheduleComputeActive,
    ],
  );

  useEffect(() => {
    onRegisterRestore(editor ? restoreToContent : null);
    return () => onRegisterRestore(null);
  }, [editor, restoreToContent, onRegisterRestore]);

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
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-default border-t-transparent" />
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
    <div
      ref={scrollContainerRef}
      onScroll={handleScroll}
      className="wiki-editor flex min-h-0 flex-1 flex-col overflow-y-auto scrollbar-thin"
    >
      <EditorContent editor={editor} />
    </div>
  );
}
