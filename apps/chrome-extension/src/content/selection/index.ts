import { computePosition, flip, offset, shift } from "@floating-ui/dom";
import { debounce } from "es-toolkit";
import { sendMessage } from "@/lib/messaging";
import { selectionPopupEnabledItem } from "@/lib/storage";
import { mountVmemLogo } from "@/content/shared/icons";
import type { VmemLogoVariant } from "@/content/shared/icons";
import { checkIcon, errorIcon } from "@/content/shared/status-icons";
import { createShadowHost, onDocumentReady } from "@/content/shared/dom-utils";
import { errorMessage } from "@/lib/error";

const VMEM_LOGO_SIZE = 16;
const CHECK_ICON = checkIcon(16);
const ERROR_ICON = errorIcon(16);

// the popup's background follows prefers color scheme (see styles below) so
// the logo img must too: black logo on the light pill white on the dark one
function logoVariant(): VmemLogoVariant {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "light"
    : "dark";
}

// spinner is pure css see styles below

// state

type PopupState = "idle" | "ready" | "saving" | "success" | "error";

let state: PopupState = "idle";
let capturedText = "";
let enabled = false; // set by init() after reading storage
let hideTimer: ReturnType<typeof setTimeout> | null = null;
let repositionRaf: number | null = null;

// shadow dom setup

const { host, shadow } = createShadowHost(
  "vmem-selection-popup",
  `
  @import url('https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600&display=swap');

  :host {
    all: initial;
  }

  #vmem-popup {
    position: fixed;
    display: none;
    align-items: center;
    justify-content: center;
    pointer-events: auto;
    box-sizing: border-box;
    width: 32px;
    height: 32px;
    padding: 8px;
    border: 1px solid transparent;
    border-radius: 99px;
    background: #ebebee;
    color: #2a2a2f;
    box-shadow: 0 1px 3px rgba(16, 24, 40, 0.1), 0 6px 16px rgba(16, 24, 40, 0.08);
    cursor: pointer;
    font-family: 'Instrument Sans', system-ui, -apple-system, sans-serif;
    opacity: 0;
    transform: translateY(4px);
    overflow: hidden;
    white-space: nowrap;
    transition: opacity 240ms cubic-bezier(0.22, 1, 0.36, 1),
                transform 240ms cubic-bezier(0.22, 1, 0.36, 1),
                width 240ms cubic-bezier(0.22, 1, 0.36, 1),
                padding 240ms cubic-bezier(0.22, 1, 0.36, 1),
                background 180ms ease,
                box-shadow 180ms ease,
                color 180ms ease,
                border-color 180ms ease;
    user-select: none;
    -webkit-user-select: none;
  }

  /* extend hit area to 40px minimum */
  #vmem-popup::before {
    content: '';
    position: absolute;
    inset: -4px;
    border-radius: 99px;
  }

  #vmem-popup.visible {
    display: flex;
    opacity: 1;
    transform: translateY(0);
  }

  /* expand to pill on hover only in ready state interpolate size lets the width animate to max content so the label never truncates */
  #vmem-popup {
    interpolate-size: allow-keywords;
  }
  #vmem-popup.expandable:hover {
    background: rgba(235, 235, 238, 0.95);
    box-shadow: 0 1px 3px rgba(16, 24, 40, 0.08), 0 10px 28px rgba(16, 24, 40, 0.12);
    transform: translateY(-1px);
    width: max-content;
    padding: 8px 14px 8px 10px;
  }

  #vmem-popup.expandable:active {
    transform: translateY(0) scale(0.96);
  }

  /* label hidden by default fades in on hover */
  .vmem-label {
    font-size: 13px;
    font-weight: 500;
    line-height: 1;
    opacity: 0;
    max-width: 0;
    margin-left: 0;
    overflow: hidden;
    pointer-events: none;
    transition: opacity 200ms cubic-bezier(0.22, 1, 0.36, 1),
                max-width 240ms cubic-bezier(0.22, 1, 0.36, 1),
                margin-left 240ms cubic-bezier(0.22, 1, 0.36, 1);
  }

  #vmem-popup.expandable:hover .vmem-label {
    opacity: 1;
    max-width: max-content;
    margin-left: 6px;
  }

  /* state specific colours (drive currentcolor in svgs) */
  #vmem-popup.state-success {
    background: #dcfce7;
    color: #16a34a;
  }
  #vmem-popup.state-error {
    background: #fee2e2;
    color: #dc2626;
  }

  /* spinner animation */
  @keyframes vmem-spin {
    to { transform: rotate(360deg); }
  }

  .vmem-spinner {
    width: 16px;
    height: 16px;
    border: 2px solid #d1d5db;
    border-top-color: #2a2a2f;
    border-radius: 50%;
    animation: vmem-spin 600ms linear infinite;
  }

  .vmem-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    line-height: 0;
    flex-shrink: 0;
  }

  /* dark mode */
  @media (prefers-color-scheme: dark) {
    #vmem-popup {
      background: rgba(38, 38, 42, 0.92);
      color: #e4e4e7;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3), 0 6px 16px rgba(0, 0, 0, 0.25);
      border-color: rgba(255, 255, 255, 0.08);
    }

    #vmem-popup.expandable:hover {
      background: rgba(48, 48, 54, 0.95);
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25), 0 10px 28px rgba(0, 0, 0, 0.3);
    }

    #vmem-popup.state-success {
      background: rgba(22, 101, 52, 0.3);
      color: #16a34a;
    }

    #vmem-popup.state-error {
      background: rgba(153, 27, 27, 0.3);
      color: #dc2626;
    }

    .vmem-spinner {
      border-color: #4a4a50;
      border-top-color: #e4e4e7;
    }
  }
`,
);
host.setAttribute("data-vmem-selection", "true");

// popup dom

const popup = document.createElement("div");
popup.id = "vmem-popup";
popup.setAttribute("role", "button");
popup.setAttribute("aria-label", "Save selection to vmem");

const iconContainer = document.createElement("div");
iconContainer.className = "vmem-icon";
mountVmemLogo(iconContainer, logoVariant(), VMEM_LOGO_SIZE);
popup.appendChild(iconContainer);

const label = document.createElement("span");
label.className = "vmem-label";
label.textContent = "Save to vmem";
popup.appendChild(label);

shadow.appendChild(popup);

// state transitions

function transitionTo(next: PopupState): void {
  state = next;

  // clear pending hide timers on any transition
  if (hideTimer !== null) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }

  // remove state classes + expandable (only re added in ready state)
  popup.classList.remove("state-success", "state-error", "expandable");

  switch (next) {
    case "idle":
      popup.classList.remove("visible");
      // reset icon after hide animation
      setTimeout(() => {
        if (state === "idle") {
          mountVmemLogo(iconContainer, logoVariant(), VMEM_LOGO_SIZE);
        }
      }, 250);
      break;

    case "ready":
      mountVmemLogo(iconContainer, logoVariant(), VMEM_LOGO_SIZE);
      popup.classList.add("visible", "expandable");
      break;

    case "saving":
      iconContainer.innerHTML = `<div class="vmem-spinner"></div>`;
      break;

    case "success":
      iconContainer.innerHTML = CHECK_ICON;
      popup.classList.add("state-success");
      hideTimer = setTimeout(() => transitionTo("idle"), 1500);
      break;

    case "error":
      iconContainer.innerHTML = ERROR_ICON;
      popup.classList.add("state-error");
      hideTimer = setTimeout(() => transitionTo("idle"), 2000);
      break;
  }
}

// positioning

function getSelectionRect(): DOMRect | null {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
    return null;
  }

  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;
  return rect;
}

async function positionPopup(): Promise<void> {
  const rect = getSelectionRect();
  if (!rect) return;

  const virtualEl = {
    getBoundingClientRect: () => rect,
  };

  const { x, y } = await computePosition(virtualEl, popup, {
    placement: "bottom",
    strategy: "fixed",
    middleware: [offset(8), flip(), shift({ padding: 8 })],
  });

  popup.style.left = `${x}px`;
  popup.style.top = `${y}px`;
}

// save logic

async function saveSelection(): Promise<void> {
  if (state !== "ready" || capturedText.length === 0) return;

  transitionTo("saving");

  try {
    await sendMessage("saveSelection", {
      selectedText: capturedText,
      pageUrl: window.location.href,
      pageTitle: document.title,
    });
    transitionTo("success");
  } catch (err) {
    console.error(
      "[vmem] Save failed:",
      errorMessage(err),
      "— reload the page to reconnect.",
    );
    transitionTo("error");
  }
}

// event handlers

function onMouseUp(e: MouseEvent): void {
  if (!enabled) return;

  // skip right clicks (context menu)
  if (e.button === 2) return;

  // skip clicks inside our own popup
  if (e.target === host) return;

  // use rAF to let the browser finalise the selection
  requestAnimationFrame(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;

    const text = selection.toString().trim();
    if (text.length < 3) return;

    capturedText = text;
    transitionTo("ready");
    void positionPopup();
  });
}

const onSelectionChangeDebounced = debounce(() => {
  const selection = window.getSelection();

  // if selection is cleared and we're in ready state, hide
  if (
    (!selection ||
      selection.isCollapsed ||
      selection.toString().trim().length < 3) &&
    state === "ready"
  ) {
    transitionTo("idle");
  }
}, 100);

function onSelectionChange(): void {
  if (!enabled) return;
  onSelectionChangeDebounced();
}

function onScrollOrResize(): void {
  if (!enabled) return;
  if (state !== "ready") return;

  // throttle repositioning with rAF
  if (repositionRaf !== null) return;

  repositionRaf = requestAnimationFrame(() => {
    repositionRaf = null;
    if (state === "ready") {
      void positionPopup();
    }
  });
}

// prevent click on popup from clearing the text selection
function onPopupMouseDown(e: Event): void {
  e.preventDefault();
}

function onPopupClick(e: Event): void {
  e.preventDefault();
  e.stopPropagation();
  void saveSelection();
}

// toggle support

function attachListeners(): void {
  document.addEventListener("mouseup", onMouseUp, true);
  document.addEventListener("selectionchange", onSelectionChange);
  window.addEventListener("scroll", onScrollOrResize, { passive: true });
  window.addEventListener("resize", onScrollOrResize, { passive: true });
}

function detachListeners(): void {
  document.removeEventListener("mouseup", onMouseUp, true);
  document.removeEventListener("selectionchange", onSelectionChange);
  window.removeEventListener("scroll", onScrollOrResize);
  window.removeEventListener("resize", onScrollOrResize);
  onSelectionChangeDebounced.cancel();

  // hide popup if visible
  if (state !== "idle") {
    transitionTo("idle");
  }
}

function setEnabled(value: boolean): void {
  if (value === enabled) return;
  enabled = value;

  if (enabled) {
    attachListeners();
  } else {
    detachListeners();
  }
}

// initialisation

function init(): void {
  // attach popup event listeners (these stay regardless of toggle)
  popup.addEventListener("mousedown", onPopupMouseDown);
  popup.addEventListener("click", onPopupClick);

  // append host to document
  document.body.appendChild(host);

  void selectionPopupEnabledItem.getValue().then(setEnabled);
  selectionPopupEnabledItem.watch(setEnabled);
}

onDocumentReady(init);
