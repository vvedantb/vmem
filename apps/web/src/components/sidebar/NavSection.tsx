import type { ReactNode } from "react";
import { sidebarSectionLabelClass } from "./sidebar-nav-row";

type NavSectionProps = {
  title: string;
  isIconOnly: boolean;
  children: ReactNode;
};

// Eva SettingsSidebar / RepoNavSections: static label, always-open items, no indent.
export function NavSection({ title, isIconOnly, children }: NavSectionProps) {
  return (
    <div>
      {isIconOnly ? null : <p className={sidebarSectionLabelClass}>{title}</p>}
      <div className="space-y-1">{children}</div>
    </div>
  );
}
