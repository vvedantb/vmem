"use client";

import { createContext, use, useState, type ReactNode } from "react";

type WikiSidebarContextValue = {
  outlineVisible: boolean;
  setOutlineVisible: (visible: boolean) => void;
  historyVisible: boolean;
  setHistoryVisible: (visible: boolean) => void;
  wordCount: number;
  setWordCount: (count: number) => void;
};

const WikiSidebarContext = createContext<WikiSidebarContextValue | null>(null);

export function WikiSidebarProvider({ children }: { children: ReactNode }) {
  const [outlineVisible, setOutlineVisible] = useState(true);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [wordCount, setWordCount] = useState(0);

  return (
    <WikiSidebarContext
      value={{
        outlineVisible,
        setOutlineVisible,
        historyVisible,
        setHistoryVisible,
        wordCount,
        setWordCount,
      }}
    >
      {children}
    </WikiSidebarContext>
  );
}

export function useWikiSidebar() {
  const value = use(WikiSidebarContext);
  if (value === null) {
    throw new Error("useWikiSidebar must be used within WikiSidebarProvider");
  }
  return value;
}
