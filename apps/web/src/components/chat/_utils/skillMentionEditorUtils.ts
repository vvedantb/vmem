import type { Id } from "@vmem/backend";
import { segmentInputBySkills } from "@vmem/shared";
import {
  EDITOR_CHIP_CLICKABLE_CLASS,
  SKILL_CHIP_CLASS,
} from "./mentionChipStyles";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function normalizeEditorText(text: string): string {
  return text.replace(/\u200B/g, "");
}

export function extractEditableText(el: Element): string {
  let out = "";
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.textContent ?? "";
    } else if (node instanceof Element) {
      if (node.tagName === "BR") {
        out += "\n";
      } else if (node.tagName === "DIV" || node.tagName === "P") {
        if (out !== "" && !out.endsWith("\n")) out += "\n";
        out += extractEditableText(node);
      } else {
        out += extractEditableText(node);
      }
    }
  }
  return out;
}

export function placeCursorAtEnd(el: Element): void {
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

export function getCursorTextOffset(root: HTMLElement): number {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return 0;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.startContainer)) return 0;
  const preRange = range.cloneRange();
  preRange.selectNodeContents(root);
  preRange.setEnd(range.startContainer, range.startOffset);
  return normalizeEditorText(preRange.toString()).length;
}

export function setCursorTextOffset(root: HTMLElement, offset: number): void {
  const sel = window.getSelection();
  if (!sel) return;
  let remaining = offset;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const len = node.textContent?.length ?? 0;
    if (remaining <= len) {
      const range = document.createRange();
      range.setStart(node, remaining);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      return;
    }
    remaining -= len;
    node = walker.nextNode();
  }
  placeCursorAtEnd(root);
}

export function syncSkillMapFromValue(
  value: string,
  skillNames: ReadonlySet<string>,
  skillNameToId: ReadonlyMap<string, Id<"skills">>,
): Map<string, Id<"skills">> {
  const segments = segmentInputBySkills(value, skillNames);
  const next = new Map<string, Id<"skills">>();
  for (const segment of segments) {
    if (segment.kind === "skill") {
      const id = skillNameToId.get(segment.name);
      if (id) next.set(segment.name, id);
    }
  }
  return next;
}

function renderSkillChipSpan(
  token: string,
  label: string,
  chipClassName: string,
  clickable: boolean,
): string {
  const className = clickable
    ? `${chipClassName} ${EDITOR_CHIP_CLICKABLE_CLASS}`
    : chipClassName;
  return `\u200B<span data-skill="true" data-skill-label="${escapeHtml(label)}" contenteditable="false" class="${escapeHtml(className)}">${escapeHtml(token)}</span>\u200B`;
}

export function renderSkillChipHtml(
  value: string,
  skillMap: ReadonlyMap<string, Id<"skills">>,
  chipClassName: string,
  chipsClickable: boolean,
): string {
  const segments = segmentInputBySkills(value, new Set(skillMap.keys()));

  return segments
    .map((segment) => {
      if (segment.kind === "skill") {
        return renderSkillChipSpan(
          segment.text,
          segment.name,
          chipClassName,
          chipsClickable && skillMap.has(segment.name),
        );
      }
      return escapeHtml(segment.text).replace(/\n/g, "<br>");
    })
    .join("");
}
