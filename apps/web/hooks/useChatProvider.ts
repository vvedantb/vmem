import { useCallback, useSyncExternalStore } from "react";

export type ChatProvider = "cloud" | "local";

const STORAGE_KEY = "vmem:chatProvider";
const DEFAULT_PROVIDER: ChatProvider = "cloud";

const listeners = new Set<() => void>();

function readProvider(): ChatProvider {
  if (typeof window === "undefined") {
    return DEFAULT_PROVIDER;
  }

  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "cloud" || stored === "local") {
    return stored;
  }

  return DEFAULT_PROVIDER;
}

function emitChange() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);

  if (typeof window !== "undefined") {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) {
        listener();
      }
    };

    window.addEventListener("storage", handleStorage);

    return () => {
      listeners.delete(listener);
      window.removeEventListener("storage", handleStorage);
    };
  }

  return () => {
    listeners.delete(listener);
  };
}

export function useChatProvider() {
  const provider = useSyncExternalStore(
    subscribe,
    readProvider,
    () => DEFAULT_PROVIDER,
  );

  const setProvider = useCallback((newProvider: ChatProvider) => {
    if (typeof window === "undefined") {
      return;
    }

    localStorage.setItem(STORAGE_KEY, newProvider);
    emitChange();
  }, []);

  return { provider, setProvider };
}
