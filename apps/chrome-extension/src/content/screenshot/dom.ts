/**
 * Builds the screenshot overlay's Shadow-DOM tree once at module load.
 * Exports the element refs the orchestrator wires events onto. Calling
 * `mountOverlay()` attaches the host to <body> when ready.
 *
 * Kept as a side-effecting module (not a factory) so the orchestrator
 * can reference these singletons directly the way the original
 * monolithic file did.
 */

import { mountVmemLogo } from "@/content/shared/icons";
import { overlayCss } from "./styles";

export const host = document.createElement("vmem-screenshot-overlay");
host.setAttribute("data-vmem-screenshot", "true");
Object.assign(host.style, {
  position: "fixed",
  top: "0",
  left: "0",
  width: "0",
  height: "0",
  overflow: "visible",
  zIndex: "2147483647",
  pointerEvents: "none",
});

const shadow = host.attachShadow({ mode: "closed" });

const styleEl = document.createElement("style");
styleEl.textContent = overlayCss;
shadow.appendChild(styleEl);

// ── Scrim + rect ────────────────────────────────────────────────────────────

export const scrim = document.createElement("div");
scrim.id = "scrim";

const hint = document.createElement("div");
hint.id = "hint";
hint.textContent = "Drag to capture · Esc to cancel";
scrim.appendChild(hint);

export const rectEl = document.createElement("div");
rectEl.id = "rect";
scrim.appendChild(rectEl);

shadow.appendChild(scrim);

// ── Preview popup ───────────────────────────────────────────────────────────

export const preview = document.createElement("div");
preview.id = "preview";

export const thumb = document.createElement("img");
thumb.className = "thumb";
thumb.alt = "Screenshot preview";
preview.appendChild(thumb);

export const captionInput = document.createElement("input");
captionInput.className = "caption";
captionInput.type = "text";
captionInput.placeholder = "Add a note (optional)";
captionInput.maxLength = 200;
preview.appendChild(captionInput);

export const saveBtn = document.createElement("button");
saveBtn.className = "save";
saveBtn.type = "button";

export const saveIcon = document.createElement("span");
saveIcon.className = "icon";
mountVmemLogo(saveIcon, "dark", 14);
saveBtn.appendChild(saveIcon);

export const saveLabel = document.createElement("span");
saveLabel.textContent = "Save";
saveBtn.appendChild(saveLabel);

preview.appendChild(saveBtn);

shadow.appendChild(preview);

/** Attach the host to <body> once the document is ready. */
export function mountOverlay(): void {
  if (document.body) {
    document.body.appendChild(host);
  } else {
    document.addEventListener("DOMContentLoaded", () => {
      document.body.appendChild(host);
    });
  }
}
