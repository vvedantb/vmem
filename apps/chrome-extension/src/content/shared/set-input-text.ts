export type FocusPolicy = "before" | "after";

/** Set contenteditable input text with platform-specific focus ordering. */
export function setInputText(
  el: HTMLElement,
  text: string,
  focus: FocusPolicy,
): void {
  if (focus === "before") el.focus();
  el.textContent = text;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  if (focus === "after") el.focus();
}
