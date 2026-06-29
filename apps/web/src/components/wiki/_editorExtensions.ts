import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";

/**
 * Shared TipTap extension set for the wiki, so the editable editor
 * (`WikiEditor`) and the read-only version preview (`WikiHistoryPanel`) render
 * markdown identically.
 */
export function wikiEditorExtensions() {
  return [
    StarterKit,
    Markdown.configure({
      html: false,
      transformPastedText: true,
      transformCopiedText: true,
    }),
  ];
}
