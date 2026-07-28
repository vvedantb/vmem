// floating memory panel above chat input, shadow-dom for host-page isolation

import { computePosition, offset, shift } from "@floating-ui/dom";
import { escape } from "es-toolkit";
import type { MemoryCandidate } from "@/types/api";
import { createShadowHost } from "./dom-utils";

let host: HTMLElement | null = null;
let shadow: ShadowRoot | null = null;
let panelEl: HTMLElement | null = null;
let memories: MemoryCandidate[] = [];
let removedIds = new Set<string>();
let currentAnchor: HTMLElement | null = null;

const STYLES = `
  :host { all: initial; }

  #memory-panel {
    position: fixed;
    display: none;
    max-width: 420px;
    min-width: 280px;
    background: rgba(24, 24, 28, 0.95);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.3);
    color: #e5e5e5;
    font-family: 'Instrument Sans', system-ui, -apple-system, sans-serif;
    font-size: 13px;
    overflow: hidden;
    z-index: 2147483646;
    pointer-events: auto;
    opacity: 0;
    transform: translateY(8px);
    transition: opacity 200ms ease, transform 200ms cubic-bezier(0.22,1,0.36,1);
  }

  #memory-panel.visible {
    opacity: 1;
    transform: translateY(0);
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    border-bottom: 1px solid rgba(255,255,255,0.08);
  }

  .panel-header .count {
    font-weight: 600;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #a0a0a0;
  }

  .clear-all {
    background: none;
    border: none;
    color: #f87171;
    font-size: 12px;
    cursor: pointer;
    font-family: inherit;
    padding: 2px 6px;
    border-radius: 4px;
  }
  .clear-all:hover { background: rgba(248,113,113,0.1); }

  .panel-body {
    max-height: 240px;
    overflow-y: auto;
    padding: 6px;
  }

  .panel-body::-webkit-scrollbar { width: 4px; }
  .panel-body::-webkit-scrollbar-track { background: transparent; }
  .panel-body::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 4px; }

  .memory-card {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 8px 10px;
    border-radius: 8px;
    transition: background 150ms ease;
  }
  .memory-card:hover { background: rgba(255,255,255,0.05); }

  .memory-info {
    flex: 1;
    min-width: 0;
  }

  .memory-title {
    display: block;
    font-weight: 500;
    font-size: 13px;
    color: #f0f0f0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .memory-snippet {
    display: block;
    font-size: 12px;
    color: #888;
    margin-top: 2px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .remove-btn {
    background: none;
    border: none;
    color: #666;
    font-size: 16px;
    cursor: pointer;
    padding: 2px 6px;
    border-radius: 4px;
    flex-shrink: 0;
    line-height: 1;
    font-family: inherit;
  }
  .remove-btn:hover { background: rgba(255,255,255,0.1); color: #f87171; }

  .panel-footer {
    padding: 8px 14px;
    border-top: 1px solid rgba(255,255,255,0.08);
    text-align: center;
    font-size: 11px;
    color: #666;
    letter-spacing: 0.3px;
  }

  .loading-body {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 16px 14px;
    color: #888;
    font-size: 12px;
  }

  .spinner {
    width: 16px;
    height: 16px;
    border: 2px solid rgba(255,255,255,0.1);
    border-top-color: #a0a0a0;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
`;

function ensureContainer(): void {
  if (host) return;

  // one below toast z-index, kept separate on purpose
  ({ host, shadow } = createShadowHost(
    "vmem-memory-panel",
    STYLES,
    "2147483646",
  ));

  panelEl = document.createElement("div");
  panelEl.id = "memory-panel";
  shadow.appendChild(panelEl);

  document.documentElement.appendChild(host);
}

async function positionPanel(anchor: HTMLElement): Promise<void> {
  if (!panelEl) return;

  const anchorRect = anchor.getBoundingClientRect();
  const panelWidth = Math.min(anchorRect.width, 420);
  panelEl.style.width = `${panelWidth}px`;
  panelEl.style.bottom = "auto";

  const { x, y } = await computePosition(anchor, panelEl, {
    placement: "top-start",
    strategy: "fixed",
    middleware: [offset(8), shift({ padding: 8 })],
  });

  panelEl.style.left = `${x}px`;
  panelEl.style.top = `${y}px`;
}

function render(): void {
  if (!panelEl || !currentAnchor) return;

  const included = memories.filter((m) => !removedIds.has(m.id));

  if (included.length === 0) {
    panelEl.classList.remove("visible");
    panelEl.style.display = "none";
    return;
  }

  panelEl.style.display = "block";

  const cardsHtml = included
    .map(
      (m) => `
    <div class="memory-card" data-id="${escape(m.id)}">
      <div class="memory-info">
        <span class="memory-title">${escape(m.title.slice(0, 60))}</span>
        <span class="memory-snippet">${escape(m.content.slice(0, 100))}</span>
      </div>
      <button class="remove-btn" data-id="${escape(m.id)}" title="Remove">×</button>
    </div>`,
    )
    .join("");

  panelEl.innerHTML = `
    <div class="panel-header">
      <span class="count">${included.length} memor${included.length === 1 ? "y" : "ies"} found</span>
      <button class="clear-all">Clear all</button>
    </div>
    <div class="panel-body">${cardsHtml}</div>
    <div class="panel-footer">Hit send to include context</div>
  `;

  void positionPanel(currentAnchor);
  void panelEl.offsetWidth;
  panelEl.classList.add("visible");

  const clearBtn = panelEl.querySelector(".clear-all");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      clearMemories();
    });
  }

  panelEl.querySelectorAll(".remove-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-id");
      if (id) {
        removedIds.add(id);
        render();
      }
    });
  });
}

export function showMemoryPanelLoading(anchor: HTMLElement): void {
  ensureContainer();
  if (!panelEl) return;

  currentAnchor = anchor;
  memories = [];
  removedIds = new Set<string>();

  panelEl.style.display = "block";

  panelEl.innerHTML = `
    <div class="loading-body">
      <div class="spinner"></div>
      <span>Searching memories…</span>
    </div>
  `;

  void positionPanel(anchor);
  void panelEl.offsetWidth;
  panelEl.classList.add("visible");
}

export function showMemoryPanel(
  newMemories: MemoryCandidate[],
  anchor: HTMLElement,
): void {
  ensureContainer();
  memories = newMemories;
  removedIds = new Set<string>();
  currentAnchor = anchor;
  render();
}

export function hideMemoryPanel(): void {
  if (panelEl) {
    panelEl.classList.remove("visible");
    panelEl.style.display = "none";
  }
}

export function getIncludedMemories(): MemoryCandidate[] {
  return memories.filter((m) => !removedIds.has(m.id));
}

export function clearMemories(): void {
  memories = [];
  removedIds = new Set<string>();
  currentAnchor = null;
  hideMemoryPanel();
}
