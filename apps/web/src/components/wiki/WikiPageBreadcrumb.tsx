"use client";

import type { Doc } from "@vmem/backend";
import { Breadcrumb, BreadcrumbLink, BreadcrumbPage } from "@vmem/ui";

interface WikiPageBreadcrumbProps {
  ancestors: Array<Doc<"wikiNodes">>;
  title: string;
  onTitleChange: (value: string) => void;
  onTitleCommit: () => void;
}

export function WikiPageBreadcrumb({
  ancestors,
  title,
  onTitleChange,
  onTitleCommit,
}: WikiPageBreadcrumbProps) {
  return (
    <Breadcrumb className="w-full min-w-0">
      {ancestors.map((node) => (
        <BreadcrumbLink key={node._id} asChild>
          <span className="max-w-[120px] shrink-0 cursor-default truncate">
            {node.title}
          </span>
        </BreadcrumbLink>
      ))}
      <BreadcrumbPage className="min-w-0 flex-1">
        <input
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          onBlur={onTitleCommit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.currentTarget.blur();
            }
          }}
          placeholder="Untitled"
          aria-label="Document title"
          className="w-full min-w-0 bg-transparent text-inherit outline-none placeholder:text-muted/50"
        />
      </BreadcrumbPage>
    </Breadcrumb>
  );
}
