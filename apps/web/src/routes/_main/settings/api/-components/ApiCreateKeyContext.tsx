"use client";

import { createContext, use, useState, type ReactNode } from "react";

type ApiCreateKeyContextValue = {
  isCreateModalOpen: boolean;
  setIsCreateModalOpen: (open: boolean) => void;
};

const ApiCreateKeyContext = createContext<ApiCreateKeyContextValue | null>(
  null,
);

export function ApiCreateKeyProvider({ children }: { children: ReactNode }) {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

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
