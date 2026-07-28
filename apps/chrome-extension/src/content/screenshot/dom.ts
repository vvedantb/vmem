// screenshot overlay shadow-dom built once at module load

import { mountVmemLogo } from "@/content/shared/icons";
import { createShadowHost, onDocumentReady } from "@/content/shared/dom-utils";
import { overlayCss } from "./styles";

const { host, shadow } = createShadowHost(
  "vmem-screenshot-overlay",
  overlayCss,
);
export { host };
host.setAttribute("data-vmem-screenshot", "true");

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

export function mountOverlay(): void {
  onDocumentReady(() => {
    document.body.appendChild(host);
  });
}
