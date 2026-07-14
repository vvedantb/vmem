"use client";

import { Link } from "@tanstack/react-router";
import type { Doc } from "@vmem/backend";
import { Breadcrumb, BreadcrumbLink, BreadcrumbPage, Input } from "@vmem/ui";
import { useActiveProfile } from "@/components/workspace/active-profile";

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
  const profileId = useActiveProfile()._id;

  return (
    <Breadcrumb className="w-full min-w-0">
      {ancestors.map((node) => (
        <BreadcrumbLink key={node._id} asChild>
          <Link
            to="/$profileId/wiki/$docId"
            params={{ profileId, docId: node._id }}
            className="max-w-[120px] shrink-0 truncate"
          >
            {node.title}
          </Link>
        </BreadcrumbLink>
      ))}
      <BreadcrumbPage className="min-w-0 flex-1">
        <Input
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
          className="h-auto min-w-0 rounded-none border-0 bg-transparent px-0 py-0 font-instrumentSerif text-2xl shadow-none focus-visible:ring-0 placeholder:text-muted/50"
        />
      </BreadcrumbPage>
    </Breadcrumb>
  );
}
