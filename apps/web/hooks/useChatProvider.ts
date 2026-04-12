/**
 * Hook for managing the chat provider preference (cloud vs local).
 * Persisted to localStorage so it survives page refreshes.
 */
import { useState, useEffect, useCallback } from "react";

export type ChatProvider = "cloud" | "local";

const STORAGE_KEY = "vmem:chatProvider";
const DEFAULT_PROVIDER: ChatProvider = "cloud";

export function useChatProvider() {
  const [provider, setProviderState] = useState<ChatProvider>(DEFAULT_PROVIDER);

  // Read from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "cloud" || stored === "local") {
      setProviderState(stored);
    }
  }, []);

  const setProvider = useCallback((newProvider: ChatProvider) => {
    setProviderState(newProvider);
    localStorage.setItem(STORAGE_KEY, newProvider);
  }, []);

  return { provider, setProvider };
}
