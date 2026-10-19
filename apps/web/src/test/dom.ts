// Shared happy-dom helpers for provider pin tests.
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

type MediaListener = (event: { matches: boolean }) => void;

/** Stub `prefers-color-scheme: dark`; returns a setter that fires listeners. */
export function stubSystemDark(initial: boolean): (dark: boolean) => void {
  let matches = initial;
  const listeners = new Set<MediaListener>();
  const query = {
    get matches() {
      return matches;
    },
    media: "(prefers-color-scheme: dark)",
    addListener: (fn: MediaListener) => listeners.add(fn),
    removeListener: (fn: MediaListener) => listeners.delete(fn),
    addEventListener: (_type: string, fn: MediaListener) => listeners.add(fn),
    removeEventListener: (_type: string, fn: MediaListener) =>
      listeners.delete(fn),
  };
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: () => query,
  });
  return (dark) => {
    matches = dark;
    for (const fn of listeners) fn({ matches: dark });
  };
}

export type Mounted = {
  rerender: (node: ReactNode) => Promise<void>;
  unmount: () => Promise<void>;
};

export async function mount(node: ReactNode): Promise<Mounted> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  await act(async () => root.render(node));
  return {
    rerender: async (next) => {
      await act(async () => root.render(next));
    },
    unmount: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

/** Map-backed localStorage that records every write in order. */
export function recordStorage(): Array<[string, string]> {
  const items = new Map<string, string>();
  const writes: Array<[string, string]> = [];
  const storage = {
    get length() {
      return items.size;
    },
    key: (i: number) => [...items.keys()][i] ?? null,
    getItem: (k: string) => items.get(k) ?? null,
    setItem: (k: string, v: string) => {
      writes.push([k, v]);
      items.set(k, v);
    },
    removeItem: (k: string) => {
      items.delete(k);
    },
    clear: () => items.clear(),
  };
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: storage,
  });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: storage,
  });
  return writes;
}

export function resetDocument(): void {
  const html = document.documentElement;
  html.className = "";
  html.removeAttribute("style");
  delete html.dataset.pageMotion;
  document.title = "vmem";
  document.body.innerHTML = "";
}
