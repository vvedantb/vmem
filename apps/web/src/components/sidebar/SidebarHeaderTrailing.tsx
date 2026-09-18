import { createContext, use, type ReactNode } from "react";
import { createPortal } from "react-dom";

const SidebarHeaderTrailingContext = createContext<HTMLElement | null>(null);

// Parks a control (usually the skills/wiki plus) at the right end of the
// panel title row, matching Eva ContextSidebarHeaderAction.
export function SidebarHeaderTrailingProvider({
  target,
  children,
}: {
  target: HTMLElement | null;
  children: ReactNode;
}) {
  return (
    <SidebarHeaderTrailingContext value={target}>
      {children}
    </SidebarHeaderTrailingContext>
  );
}

export function SidebarHeaderTrailing({ children }: { children: ReactNode }) {
  const target = use(SidebarHeaderTrailingContext);
  if (target === null) return null;
  return createPortal(children, target);
}
