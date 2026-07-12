"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { useDebounceValue } from "usehooks-ts";
import { IconSearch, IconFileText, IconFolder } from "@tabler/icons-react";
import { api } from "@vmem/backend";
import { Button, Input } from "@vmem/ui";
import { sidebarSearchInputClassName } from "@/components/sidebar/sidebar-search-input";
import { useActiveTeamId } from "@/components/workspace/active-profile";

interface WikiSearchProps {
  onSelect: (id: string) => void;
}

/**
 * Top-of-left-pane search. Debounced text input with inline results below.
 * Uses the convex full-text search indexes on title + contentText, scoped
 * to the active workspace (personal or team wiki).
 */
export default function WikiSearch({ onSelect }: WikiSearchProps) {
  const [raw, setRaw] = useState("");
  const [debounced] = useDebounceValue(raw, 200);
  const teamId = useActiveTeamId();

  const trimmed = debounced.trim();
  const results = useQuery(
    api.wiki.search,
    trimmed.length > 0 ? { queryText: trimmed, teamId } : "skip",
  );

  const isSearching = raw.trim().length > 0;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative">
        <IconSearch
          size={14}
          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
        />
        <Input
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder="Search"
          className={sidebarSearchInputClassName}
        />
      </div>
      {isSearching && (
        <div className="max-h-48 overflow-y-auto scrollbar-thin rounded-md">
          {results === undefined ? (
            <p className="px-2 py-1.5 text-xs text-muted">Searching…</p>
          ) : results.length === 0 ? (
            <p className="px-2 py-1.5 text-xs text-muted">No matches.</p>
          ) : (
            <ul className="flex flex-col">
              {results.map((node) => (
                <li key={node._id}>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      if (node.kind === "document") {
                        onSelect(node._id);
                      }
                      setRaw("");
                    }}
                    disabled={node.kind !== "document"}
                    className="h-auto w-full justify-start gap-2 rounded-md px-2 py-1.5 text-left text-sm font-normal text-foreground/90 hover:bg-surface-tertiary/50 active:scale-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {node.kind === "folder" ? (
                      <IconFolder className="size-3.5 text-muted shrink-0" />
                    ) : (
                      <IconFileText className="size-3.5 text-muted shrink-0" />
                    )}
                    <span className="truncate">{node.title}</span>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
