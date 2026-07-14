import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";

// shared TipTap extension set for the wiki, so the editable editor (`WikiEditor`) and the
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
