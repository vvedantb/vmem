import type { ReactNode } from "react";

export function SkillPanelShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto scrollbar-thin px-4 pb-4 pt-2">
      {children}
    </div>
  );
}

export function SkillDescriptionSection({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted">Description</p>
      {children}
    </div>
  );
}

export function SkillInstructionsSection({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="min-h-0 flex-1 space-y-1.5">
      <p className="text-xs font-medium text-muted">Instructions</p>
      {children}
    </div>
  );
}
