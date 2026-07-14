"use client";

import { createContext, use, useState, type ReactNode } from "react";

type PageTitleContextValue = {
  pageTitle: string;
  setPageTitle: (title: string) => void;
};

const PageTitleContext = createContext<PageTitleContextValue>({
  pageTitle: "",
  setPageTitle: () => {},
});

export function PageTitleProvider({ children }: { children: ReactNode }) {
  const [pageTitle, setPageTitle] = useState("");

  return (
    <PageTitleContext value={{ pageTitle, setPageTitle }}>
      {children}
    </PageTitleContext>
  );
}

export function usePageTitle() {
  return use(PageTitleContext);
}
