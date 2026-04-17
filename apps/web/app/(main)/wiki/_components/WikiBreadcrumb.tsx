"use client";

import { Fragment } from "react";
import { IconChevronRight } from "@tabler/icons-react";
import type { Doc } from "@vmem/backend";

interface WikiBreadcrumbProps {
  ancestors: Array<Doc<"wikiNodes">>;
}

/**
 * Root → parent crumb trail shown above the editor title. Empty when the
 * document is at the root (nothing to show).
 */
export default function WikiBreadcrumb({ ancestors }: WikiBreadcrumbProps) {
  if (ancestors.length === 0) return null;

  return (
    <nav className="flex items-center gap-1 text-xs text-muted-foreground">
      {ancestors.map((node, idx) => (
        <Fragment key={node._id}>
          <span className="truncate max-w-[120px]">{node.title}</span>
          {idx < ancestors.length - 1 && (
            <IconChevronRight size={12} className="shrink-0" />
          )}
        </Fragment>
      ))}
    </nav>
  );
}
