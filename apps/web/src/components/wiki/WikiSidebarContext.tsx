"use client";

import { createContext, use, useState, type ReactNode } from "react";

type WikiSidebarContextValue = {
  outlineVisible: boolean;
  setOutlineVisible: (visible: boolean) => void;
  wordCount: number;
  setWordCount: (count: number) => void;
  hasDoc: boolean;
  setHasDoc: (has: boolean) => void;
};

const WikiSidebarContext = createContext<WikiSidebarContextValue | null>(null);

export function WikiSidebarProvider({ children }: { children: ReactNode }) {
  const [outlineVisible, setOutlineVisible] = useState(false);
  const [wordCount, setWordCount] = useState(0);
  const [hasDoc, setHasDoc] = useState(false);

  return (
    <WikiSidebarContext
      value={{
        outlineVisible,
        setOutlineVisible,
        wordCount,
        setWordCount,
        hasDoc,
        setHasDoc,
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
