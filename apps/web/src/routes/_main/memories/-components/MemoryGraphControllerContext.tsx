"use client";

import { createContext, use, type ReactNode } from "react";
import {
  useMemoryGraphController,
  type MemoryGraphController,
} from "@/hooks/useMemoryGraphController";

const MemoryGraphControllerContext =
  createContext<MemoryGraphController | null>(null);

export function MemoryGraphControllerProvider({
  focusNodeId,
  enabled = true,
  children,
}: {
  focusNodeId: string | null;
  /** Skip graph data fetching while inactive; see `useMemoryGraphController`. */
  enabled?: boolean;
  children: ReactNode;
}) {
  const controller = useMemoryGraphController({ focusNodeId, enabled });

  return (
    <MemoryGraphControllerContext value={controller}>
      {children}
    </MemoryGraphControllerContext>
  );
}

export function useMemoryGraphControllerContext(): MemoryGraphController {
  const value = use(MemoryGraphControllerContext);
  if (value === null) {
    throw new Error(
      "useMemoryGraphControllerContext must be used within MemoryGraphControllerProvider",
    );
  }
  return value;
}
