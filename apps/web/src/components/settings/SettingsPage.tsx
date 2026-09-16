import type { ReactNode } from "react";
import PageContainer from "@/components/shell/PageContainer";
import { SettingsStack } from "@/components/settings/SettingsStack";

interface SettingsPageProps {
  title: string;
  /** Sparse primary action(s) in the title row (e.g. Add, Delete). */
  headerRight?: ReactNode;
  /** Filters / search / segmented controls — sits under the title. */
  toolbar?: ReactNode;
  /** Route tabs — sits under the title (and under toolbar if both exist). */
  tabs?: ReactNode;
  /**
   * Wrap children in the standard settings section stack. Set false when the
   * child already owns its own vertical rhythm (e.g. EnvVarsTable).
   */
  stack?: boolean;
  /** Fill the remaining shell height instead of scrolling the page. */
  fillHeight?: boolean;
  children: ReactNode;
}

/**
 * Shared chrome for settings: comfortable reading width, title row, optional
 * refine toolbar / tabs, then a consistent section stack.
 * Mirrors Eva `SettingsPage`.
 */
export function SettingsPage({
  title,
  headerRight,
  toolbar,
  tabs,
  stack = true,
  fillHeight = false,
  children,
}: SettingsPageProps) {
  return (
    <PageContainer
      title={title}
      centeredMaxWidth
      insetHeader
      showTitle
      rightSection={headerRight}
      toolbar={toolbar}
      tabs={tabs}
      noScroll={fillHeight}
    >
      {stack ? <SettingsStack>{children}</SettingsStack> : children}
    </PageContainer>
  );
}
