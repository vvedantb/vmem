const MIRROR_STYLE_PROPERTIES = [
  "direction",
  "box-sizing",
  "width",
  "height",
  "overflow-x",
  "overflow-y",
  "border-top-width",
  "border-right-width",
  "border-bottom-width",
  "border-left-width",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "font-style",
  "font-variant",
  "font-weight",
  "font-stretch",
  "font-size",
  "font-size-adjust",
  "line-height",
  "font-family",
  "text-align",
  "text-transform",
  "text-indent",
  "text-decoration",
  "letter-spacing",
  "word-spacing",
  "tab-size",
] as const;

/** Pixel offset of a caret index inside a textarea (content box, scroll-adjusted). */
export function getTextareaCaretCoordinates(
  element: HTMLTextAreaElement,
  position: number,
): { top: number; left: number } {
  const computed = window.getComputedStyle(element);
  const mirror = document.createElement("div");
  const marker = document.createElement("span");

  mirror.style.position = "absolute";
  mirror.style.visibility = "hidden";
  mirror.style.whiteSpace = "pre-wrap";
  mirror.style.wordWrap = "break-word";
  mirror.style.top = "0";
  mirror.style.left = "-9999px";

  for (const prop of MIRROR_STYLE_PROPERTIES) {
    mirror.style.setProperty(prop, computed.getPropertyValue(prop));
  }

  mirror.style.width = `${element.clientWidth}px`;

  const value = element.value;
  mirror.textContent = value.slice(0, position);
  marker.textContent = value.slice(position) || ".";
  mirror.appendChild(marker);

  document.body.appendChild(mirror);

  const top =
    marker.offsetTop -
    element.scrollTop +
    Number.parseFloat(computed.paddingTop);
  const left =
    marker.offsetLeft -
    element.scrollLeft +
    Number.parseFloat(computed.paddingLeft);

  document.body.removeChild(mirror);

  return { top, left };
}
