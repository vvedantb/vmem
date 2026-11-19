// shadow-dom toasts for any host page, stack top-right, auto-dismiss.
// looks like SonnerToaster from @vvedantb/ui: same token values, sonner's icons and motion.
// the package toaster needs react + tailwind, too heavy for a content script on host pages

import { escape } from "es-toolkit";
import { createShadowHost } from "./dom-utils";

type ToastType = "success" | "error" | "loading" | "info";

interface ToastEntry {
  id: string;
  element: HTMLElement;
  timer: ReturnType<typeof setTimeout> | null;
}

let host: HTMLElement | null = null;
let shadow: ShadowRoot | null = null;
let listEl: HTMLElement | null = null;
let counter = 0;
const active = new Map<string, ToastEntry>();

const EXIT_MS = 400;

// sonner's default 20px filled icons
function filledIcon(path: string): string {
  return `<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" clip-rule="evenodd" d="${path}"/></svg>`;
}

const ICON_MAP: Record<ToastType, string> = {
  success: filledIcon(
    "M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z",
  ),
  error: filledIcon(
    "M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z",
  ),
  info: filledIcon(
    "M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z",
  ),
  loading: `<div class="spinner"></div>`,
};

// colour values copied from @vvedantb/ui/tokens (light and dark)
const STYLES = `
  :host {
    all: initial;
    --overlay: oklch(100% 0 0);
    --foreground: oklch(21.03% 0 0);
    --border: oklch(90% 0 0);
    --muted: oklch(55.17% 0 0);
    --success: oklch(73.29% 0.1941 150.81);
    --danger: oklch(65.32% 0.2335 25.74);
  }

  @media (prefers-color-scheme: dark) {
    :host {
      --overlay: oklch(21.03% 0 0);
      --foreground: oklch(99.11% 0 0);
      --border: oklch(28% 0 0);
      --muted: oklch(70.5% 0 0);
      --danger: oklch(59.4% 0.1973 24.63);
    }
  }

  #toast-list {
    position: fixed;
    top: 16px;
    right: 16px;
    display: flex;
    flex-direction: column-reverse;
    gap: 12px;
    width: 356px;
    max-width: calc(100vw - 32px);
    z-index: 2147483647;
    pointer-events: none;
  }

  .toast {
    box-sizing: border-box;
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    padding: 12px 16px;
    border-radius: 16px;
    background: var(--overlay);
    color: var(--foreground);
    font-family: 'Instrument Sans', system-ui, -apple-system, sans-serif;
    font-size: 14px;
    font-weight: 500;
    line-height: 1.375;
    pointer-events: auto;
    box-shadow:
      0 0 0 1px color-mix(in srgb, var(--border) 60%, transparent),
      0 4px 12px rgb(0 0 0 / 0.08);
    transform: translateY(-100%);
    opacity: 0;
    transition: transform 400ms ease, opacity 400ms ease;
  }

  .toast.show { transform: translateY(0); opacity: 1; }

  .toast-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    flex-shrink: 0;
  }

  .toast-success .toast-icon { color: var(--success); }
  .toast-error .toast-icon { color: var(--danger); }
  .toast-info .toast-icon { color: var(--foreground); }
  .toast-loading .toast-icon { color: var(--muted); }

  .toast-message { flex: 1; min-width: 0; overflow-wrap: anywhere; }

  .spinner {
    box-sizing: border-box;
    width: 16px;
    height: 16px;
    border: 2px solid color-mix(in srgb, currentColor 25%, transparent);
    border-top-color: currentColor;
    border-radius: 50%;
    animation: spin 600ms linear infinite;
  }

  @keyframes spin { to { transform: rotate(360deg); } }

  @media (prefers-reduced-motion: reduce) {
    .toast { transform: none; transition: opacity 200ms ease; }
  }
`;

function ensureContainer(): void {
  if (host) return;

  ({ host, shadow } = createShadowHost("vmem-toast-container", STYLES));

  listEl = document.createElement("div");
  listEl.id = "toast-list";
  listEl.setAttribute("role", "status");
  listEl.setAttribute("aria-live", "polite");
  shadow.appendChild(listEl);

  document.documentElement.appendChild(host);
}

export interface ShowToastOptions {
  type: ToastType;
  message: string;
  // duration: pass 0 to keep open, default 3000ms
  duration?: number;
}

export function showToast(options: ShowToastOptions): string {
  ensureContainer();

  const id = `vmem-toast-${++counter}`;
  const el = document.createElement("div");
  el.className = `toast toast-${options.type}`;
  el.innerHTML = `<div class="toast-icon">${ICON_MAP[options.type]}</div><span class="toast-message">${escape(options.message)}</span>`;

  if (listEl) listEl.appendChild(el);
  void el.offsetWidth;
  el.classList.add("show");

  const duration = options.duration ?? 3000;
  let timer: ReturnType<typeof setTimeout> | null = null;
  if (duration > 0) {
    timer = setTimeout(() => hideToast(id), duration);
  }

  active.set(id, { id, element: el, timer });
  return id;
}

function hideToast(id: string): void {
  const entry = active.get(id);
  if (!entry) return;

  if (entry.timer) clearTimeout(entry.timer);
  entry.element.classList.remove("show");

  setTimeout(() => {
    entry.element.remove();
    active.delete(id);
  }, EXIT_MS);
}
