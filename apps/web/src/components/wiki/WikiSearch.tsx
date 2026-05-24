"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { useDebounceValue } from "usehooks-ts";
import { IconSearch, IconFileText, IconFolder } from "@tabler/icons-react";
import { api } from "@vmem/backend";
import { Input } from "@vmem/ui";

interface WikiSearchProps {
  onSelect: (id: string) => void;
}

/**
 * Top-of-left-pane search. Debounced text input with inline results below.
 * Uses the convex full-text search indexes on title + contentText.
 */
export default function WikiSearch({ onSelect }: WikiSearchProps) {
  const [raw, setRaw] = useState("");
  const [debounced] = useDebounceValue(raw, 200);

  const trimmed = debounced.trim();
  const results = useQuery(
    api.wiki.search,
    trimmed.length > 0 ? { queryText: trimmed } : "skip",
  );

  const isSearching = raw.trim().length > 0;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative">
        <IconSearch
          size={14}
          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
        />
        <Input
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder="Search"
          className="h-8 pl-8 text-sm shadow-none focus-visible:ring-0 focus-visible:shadow-none"
        />
      </div>
      {isSearching && (
        <div className="max-h-48 overflow-y-auto scrollbar-thin rounded-md">
          {results === undefined ? (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">
              Searching…
            </p>
          ) : results.length === 0 ? (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">
              No matches.
            </p>
          ) : (
            <ul className="flex flex-col">
              {results.map((node) => (
                <li key={node._id}>
                  <button
                    type="button"
                    onClick={() => {
                      if (node.kind === "document") {
                        onSelect(node._id);
                      }
                      setRaw("");
                    }}
                    disabled={node.kind !== "document"}
                    className="w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-foreground/90 hover:bg-muted/70 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {node.kind === "folder" ? (
                      <IconFolder
                        size={14}
                        className="text-muted-foreground shrink-0"
                      />
                    ) : (
                      <IconFileText
                        size={14}
                        className="text-muted-foreground shrink-0"
                      />
                    )}
                    <span className="truncate">{node.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
