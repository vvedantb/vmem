import type { ContentMessage, BackgroundResponse } from "@/types/messages";

// ── SVG icons (vmem logo uses dark fill on light bg) ──────────────────────────

const VMEM_ICON = `<svg width="16" height="16" viewBox="0 0 210 204" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M81.3835 181.779C22.2397 161.586 13.4909 102.411 36.5078 61.7585L25.0687 36.241C-10.1246 81.7999 -19.3022 165.229 71.8802 203.249L81.3835 181.779Z" fill="currentColor"/>
  <path d="M128.109 181.779C187.253 161.586 196.002 102.411 172.985 61.7585L184.424 36.241C219.617 81.7999 228.795 165.229 137.612 203.249L128.109 181.779Z" fill="currentColor"/>
  <path d="M156.866 14.2622C115.857 -4.51398 93.2253 -4.72022 53.5056 13.461L63.1205 36.2163C92.2894 19.6073 110.744 19.1365 147.571 34.774L156.866 14.2622Z" fill="currentColor"/>
</svg>`;

const CHECK_ICON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
  <polyline points="20 6 9 17 4 12"/>
</svg>`;

const ERROR_ICON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
</svg>`;

// Spinner is pure CSS — see styles below

// ── State ─────────────────────────────────────────────────────────────────────

type PopupState = "idle" | "ready" | "saving" | "success" | "error";

let state: PopupState = "idle";
let capturedText = "";
let enabled = false; // Set by init() after reading storage
let hideTimer: ReturnType<typeof setTimeout> | null = null;
let selectionChangeTimer: ReturnType<typeof setTimeout> | null = null;
let repositionRaf: number | null = null;

// ── Shadow DOM setup ──────────────────────────────────────────────────────────

const host = document.createElement("vmem-selection-popup");
host.setAttribute("data-vmem-selection", "true");
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

// ── Styles inside shadow DOM ──────────────────────────────────────────────────

const styleEl = document.createElement("style");
styleEl.textContent = `
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

  #vmem-popup.visible {
    display: flex;
    opacity: 1;
    transform: translateY(0);
  }

  /* Expand to pill on hover — only in ready state */
  #vmem-popup.expandable:hover {
    background: rgba(235, 235, 238, 0.95);
    box-shadow: 0 1px 3px rgba(16, 24, 40, 0.08), 0 10px 28px rgba(16, 24, 40, 0.12);
    transform: translateY(-1px);
    width: 152px;
    padding: 8px 14px 8px 10px;
  }

  #vmem-popup.expandable:active {
    transform: translateY(0);
  }

  /* Label — hidden by default, fades in on hover */
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
    max-width: 80px;
    margin-left: 6px;
  }

  /* State-specific colors (drive currentColor in SVGs) */
  #vmem-popup.state-success {
    background: #dcfce7;
    color: #16a34a;
  }
  #vmem-popup.state-error {
    background: #fee2e2;
    color: #dc2626;
  }

  /* Spinner animation */
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

  /* Dark mode */
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
`;
shadow.appendChild(styleEl);

// ── Popup DOM ─────────────────────────────────────────────────────────────────

const popup = document.createElement("div");
popup.id = "vmem-popup";
popup.setAttribute("role", "button");
popup.setAttribute("aria-label", "Save selection to vmem");

const iconContainer = document.createElement("div");
iconContainer.className = "vmem-icon";
iconContainer.innerHTML = VMEM_ICON;
popup.appendChild(iconContainer);

const label = document.createElement("span");
label.className = "vmem-label";
label.textContent = "Save to vmem";
popup.appendChild(label);

shadow.appendChild(popup);

// ── State transitions ─────────────────────────────────────────────────────────

function transitionTo(next: PopupState): void {
  state = next;

  // Clear pending hide timers on any transition
  if (hideTimer !== null) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }

  // Remove state classes + expandable (only re-added in ready state)
  popup.classList.remove("state-success", "state-error", "expandable");

  switch (next) {
    case "idle":
      popup.classList.remove("visible");
      // Reset icon after hide animation
      setTimeout(() => {
        if (state === "idle") {
          iconContainer.innerHTML = VMEM_ICON;
        }
      }, 250);
      break;

    case "ready":
      iconContainer.innerHTML = VMEM_ICON;
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

// ── Positioning ───────────────────────────────────────────────────────────────

function positionPopup(): void {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;

  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();

  // Skip zero-dimension rects (collapsed or invisible selections)
  if (rect.width === 0 && rect.height === 0) return;

  const popupSize = 32;
  const gap = 8;

  // Default: centered below selection
  let x = rect.left + rect.width / 2 - popupSize / 2;
  let y = rect.bottom + gap;

  // Clamp horizontal bounds
  if (x + popupSize > window.innerWidth - gap) {
    x = window.innerWidth - popupSize - gap;
  }
  if (x < gap) {
    x = gap;
  }

  // Flip above if no room below
  if (y + popupSize > window.innerHeight - gap) {
    y = rect.top - popupSize - gap;
  }

  // Clamp to top if still off-screen
  if (y < gap) {
    y = gap;
  }

  popup.style.left = `${x}px`;
  popup.style.top = `${y}px`;
}

// ── Save logic ────────────────────────────────────────────────────────────────

function saveSelection(): void {
  if (state !== "ready" || capturedText.length === 0) return;

  transitionTo("saving");

  const message: ContentMessage = {
    type: "SAVE_SELECTION",
    selectedText: capturedText,
    pageUrl: window.location.href,
    pageTitle: document.title,
  };

  chrome.runtime.sendMessage(
    message,
    (response: BackgroundResponse | undefined) => {
      // Handle extension context invalidated (e.g. extension updated/reloaded)
      if (chrome.runtime.lastError) {
        console.error(
          "[vmem] sendMessage error:",
          chrome.runtime.lastError.message,
        );
        transitionTo("error");
        return;
      }

      if (!response) {
        console.error(
          "[vmem] No response from background — is the service worker running?",
        );
        transitionTo("error");
        return;
      }

      if (response.type === "SAVE_RESULT" && response.success) {
        transitionTo("success");
      } else if (response.type === "SAVE_DUPLICATE") {
        // Already saved — treat as success from user's perspective
        transitionTo("success");
      } else {
        console.error("[vmem] Save failed:", response);
        transitionTo("error");
      }
    },
  );
}

// ── Event handlers ────────────────────────────────────────────────────────────

function onMouseUp(e: MouseEvent): void {
  if (!enabled) return;

  // Skip right-clicks (context menu)
  if (e.button === 2) return;

  // Skip clicks inside our own popup
  if (e.target === host) return;

  // Use rAF to let the browser finalize the selection
  requestAnimationFrame(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;

    const text = selection.toString().trim();
    if (text.length < 3) return;

    capturedText = text;
    positionPopup();
    transitionTo("ready");
  });
}

function onSelectionChange(): void {
  if (!enabled) return;

  // Debounce to avoid flickering during rapid selection changes
  if (selectionChangeTimer !== null) {
    clearTimeout(selectionChangeTimer);
  }

  selectionChangeTimer = setTimeout(() => {
    selectionChangeTimer = null;
    const selection = window.getSelection();

    // If selection is cleared and we're in ready state, hide
    if (
      (!selection ||
        selection.isCollapsed ||
        selection.toString().trim().length < 3) &&
      state === "ready"
    ) {
      transitionTo("idle");
    }
  }, 100);
}

function onScrollOrResize(): void {
  if (!enabled) return;
  if (state !== "ready") return;

  // Throttle repositioning with rAF
  if (repositionRaf !== null) return;

  repositionRaf = requestAnimationFrame(() => {
    repositionRaf = null;
    if (state === "ready") {
      positionPopup();
    }
  });
}

// Prevent click on popup from clearing the text selection
function onPopupMouseDown(e: Event): void {
  e.preventDefault();
}

function onPopupClick(e: Event): void {
  e.preventDefault();
  e.stopPropagation();
  saveSelection();
}

// ── Toggle support ────────────────────────────────────────────────────────────

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

  // Hide popup if visible
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

// ── Initialization ────────────────────────────────────────────────────────────

function init(): void {
  // Attach popup event listeners (these stay regardless of toggle)
  popup.addEventListener("mousedown", onPopupMouseDown);
  popup.addEventListener("click", onPopupClick);

  // Append host to document
  document.body.appendChild(host);

  // Read initial toggle state
  chrome.storage.local.get({ selectionPopupEnabled: true }, (result) => {
    const storedEnabled = result["selectionPopupEnabled"];
    setEnabled(typeof storedEnabled === "boolean" ? storedEnabled : true);
  });

  // React to toggle changes in real-time
  chrome.storage.onChanged.addListener((changes) => {
    if ("selectionPopupEnabled" in changes) {
      const next = changes["selectionPopupEnabled"].newValue;
      setEnabled(typeof next === "boolean" ? next : true);
    }
  });
}

// Wait for document.body to be available
if (document.body) {
  init();
} else {
  document.addEventListener("DOMContentLoaded", init);
}
