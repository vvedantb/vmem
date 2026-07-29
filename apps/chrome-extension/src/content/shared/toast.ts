// shadow-dom toasts for any host page, stack bottom-right, auto-dismiss

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

const CHECK_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
const ERROR_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
const INFO_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;
const SPINNER_HTML = `<div class="spinner"></div>`;

const ICON_MAP: Record<ToastType, string> = {
  success: CHECK_SVG,
  error: ERROR_SVG,
  info: INFO_SVG,
  loading: SPINNER_HTML,
};

const STYLES = `
  :host { all: initial; }

  #toast-list {
    position: fixed;
    bottom: 16px;
    right: 16px;
    display: flex;
    flex-direction: column-reverse;
    gap: 8px;
    z-index: 2147483647;
    pointer-events: none;
  }

  .toast {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 16px;
    border-radius: 10px;
    background: rgba(24, 24, 28, 0.92);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    color: #e5e5e5;
    font-family: 'Instrument Sans', system-ui, -apple-system, sans-serif;
    font-size: 13px;
    font-weight: 500;
    pointer-events: auto;
    box-shadow: 0 4px 24px rgba(0,0,0,0.2);
    transform: translateX(120%);
    opacity: 0;
    transition: transform 300ms cubic-bezier(0.22,1,0.36,1), opacity 300ms ease;
    max-width: 320px;
  }

  .toast.show { transform: translateX(0); opacity: 1; }
  .toast.hide { transform: translateX(120%); opacity: 0; }

  .toast-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    flex-shrink: 0;
  }

  .toast-success .toast-icon { color: #4ade80; }
  .toast-error .toast-icon { color: #f87171; }
  .toast-info .toast-icon { color: #60a5fa; }
  .toast-loading .toast-icon { color: #a0a0a0; }

  .toast-message { flex: 1; line-height: 1.3; }

  .spinner {
    width: 16px;
    height: 16px;
    border: 2px solid rgba(255,255,255,0.2);
    border-top-color: #a0a0a0;
    border-radius: 50%;
    animation: spin 600ms linear infinite;
  }

  @keyframes spin { to { transform: rotate(360deg); } }
`;

function ensureContainer(): void {
  if (host) return;

  ({ host, shadow } = createShadowHost("vmem-toast-container", STYLES));

  listEl = document.createElement("div");
  listEl.id = "toast-list";
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
  entry.element.classList.add("hide");

  setTimeout(() => {
    entry.element.remove();
    active.delete(id);
  }, 300);
}
