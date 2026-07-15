import { useCallback, useEffect, useRef } from "react";
import type { Editor } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import { TableOfContents } from "@tiptap/extension-table-of-contents";
import type { TableOfContentDataItem } from "@tiptap/extension-table-of-contents";
import { toast } from "sonner";
import { wikiEditorExtensions } from "./_editorExtensions";
import {
  countWords,
  docToPlainText,
  formatWikiDocForClipboard,
} from "./_utils";
import type { OutlineHeading } from "./_utils";
import type { WikiNodeDoc } from "./-types";
import { useWikiAutosave } from "./useWikiAutosave";

interface WikiDocumentEditorProps {
  doc: WikiNodeDoc;
  titleForCopy: string;
  onRegisterCopy: (handler: (() => Promise<void>) | null) => void;
  onRegisterRestore: (
    handler: ((markdown: string) => Promise<void>) | null,
  ) => void;
  onHeadingsChange: (headings: OutlineHeading[]) => void;
  onActiveHeadingChange: (id: string | null) => void;
  onWordCountChange: (count: number) => void;
  jumpRequest: { pos: number; n: number };
}

function anchorsToHeadings(
  anchors: TableOfContentDataItem[],
): OutlineHeading[] {
  const headings: OutlineHeading[] = [];
  for (const anchor of anchors) {
    if (anchor.textContent.length === 0) continue;
    headings.push({
      id: anchor.id,
      level: anchor.originalLevel,
      text: anchor.textContent,
      pos: anchor.pos,
    });
  }
  return headings;
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

// tipTap body for wiki documents only — artifacts use WikiArtifactEditor
export default function WikiDocumentEditor({
  doc,
  titleForCopy,
  onRegisterCopy,
  onRegisterRestore,
  onHeadingsChange,
  onActiveHeadingChange,
  onWordCountChange,
  jumpRequest,
}: WikiDocumentEditorProps) {
  const { queueSave, saveNow, cancelPendingSave } = useWikiAutosave(doc._id);

  const loadedDocIdRef = useRef<string | null>(null);
  const suppressNextUpdateRef = useRef(false);
  const baselineMarkdownRef = useRef(doc.content ?? "");
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const onHeadingsChangeRef = useRef(onHeadingsChange);
  const onActiveHeadingChangeRef = useRef(onActiveHeadingChange);
  const onWordCountChangeRef = useRef(onWordCountChange);

  onHeadingsChangeRef.current = onHeadingsChange;
  onActiveHeadingChangeRef.current = onActiveHeadingChange;
  onWordCountChangeRef.current = onWordCountChange;

  const handleTocUpdate = useCallback((anchors: TableOfContentDataItem[]) => {
    const headings = anchorsToHeadings(anchors);
    onHeadingsChangeRef.current(headings);
    const active = anchors.find((anchor) => anchor.isActive);
    onActiveHeadingChangeRef.current(active?.id ?? headings[0]?.id ?? null);
  }, []);

  const editor = useEditor({
    extensions: [
      ...wikiEditorExtensions(),
      TableOfContents.configure({
        scrollParent: () => scrollContainerRef.current ?? window,
        onUpdate: handleTocUpdate,
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
      const jsonDoc = instance.getJSON();
      onWordCountChangeRef.current(countWords(docToPlainText(jsonDoc)));

      if (suppressNextUpdateRef.current) {
        suppressNextUpdateRef.current = false;
        baselineMarkdownRef.current = getMarkdownFromEditor(instance);
        return;
      }

      // toc stamps heading ids that markdown does not serialise — skip no-op saves
      const markdown = getMarkdownFromEditor(instance);
      if (markdown === baselineMarkdownRef.current) return;
      if (loadedDocIdRef.current !== doc._id) return;

      baselineMarkdownRef.current = markdown;
      queueSave({
        content: markdown,
        contentText: docToPlainText(jsonDoc),
      });
    },
  });

  // toc binds scrollParent once onCreate (often before the container ref exists)
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!editor || editor.isDestroyed || !el) return;
    const handler = () => {
      editor.storage.tableOfContents.scrollHandler();
    };
    el.addEventListener("scroll", handler);
    handler();
    return () => el.removeEventListener("scroll", handler);
  }, [editor]);

  useEffect(() => {
    if (!editor) return;

    if (loadedDocIdRef.current === doc._id) {
      return;
    }

    const markdown = doc.content ?? "";
    suppressNextUpdateRef.current = true;
    baselineMarkdownRef.current = markdown;
    editor.commands.setContent(markdown);
    loadedDocIdRef.current = doc._id;
    onWordCountChange(countWords(docToPlainText(editor.getJSON())));
  }, [doc._id, doc.content, editor, onWordCountChange]);

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

  const restoreToContent = useCallback(
    async (markdown: string) => {
      if (!editor) return;
      cancelPendingSave();
      suppressNextUpdateRef.current = true;
      baselineMarkdownRef.current = markdown;
      editor.commands.setContent(markdown);
      const jsonDoc = editor.getJSON();
      onWordCountChange(countWords(docToPlainText(jsonDoc)));
      try {
        await saveNow({
          content: getMarkdownFromEditor(editor),
          contentText: docToPlainText(jsonDoc),
          forceSnapshot: true,
        });
        baselineMarkdownRef.current = getMarkdownFromEditor(editor);
        toast.success("Version restored");
      } catch {
        // saveNow already toasts on failure
      }
    },
    [editor, cancelPendingSave, saveNow, onWordCountChange],
  );

  useEffect(() => {
    onRegisterRestore(editor ? restoreToContent : null);
    return () => onRegisterRestore(null);
  }, [editor, restoreToContent, onRegisterRestore]);

  return (
    <div
      ref={scrollContainerRef}
      className="wiki-editor flex min-h-0 flex-1 flex-col overflow-y-auto scrollbar-thin"
    >
      <EditorContent editor={editor} />
    </div>
  );
}
