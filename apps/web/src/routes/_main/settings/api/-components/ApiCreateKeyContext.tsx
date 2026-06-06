"use client";

import { createContext, use, type ReactNode } from "react";

type ApiCreateKeyContextValue = {
  isCreateModalOpen: boolean;
  setIsCreateModalOpen: (open: boolean) => void;
};

const ApiCreateKeyContext = createContext<ApiCreateKeyContextValue | null>(
  null,
);

export function ApiCreateKeyProvider({
  isCreateModalOpen,
  setIsCreateModalOpen,
  children,
}: ApiCreateKeyContextValue & { children: ReactNode }) {
  return (
    <ApiCreateKeyContext value={{ isCreateModalOpen, setIsCreateModalOpen }}>
      {children}
    </ApiCreateKeyContext>
  );
}

export function useApiCreateKeyModal(): ApiCreateKeyContextValue {
  const value = use(ApiCreateKeyContext);
  if (value === null) {
    throw new Error("useApiCreateKeyModal must be used within ApiLayout");
  }
  return value;
}
