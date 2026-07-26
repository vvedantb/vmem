import type { ReactNode } from "react";
import { useState } from "react";
import { useQuery } from "convex/react";
import { useDebounceValue } from "usehooks-ts";
import { IconCode, IconFileText, IconFolder } from "@tabler/icons-react";
import { api } from "@vmem/backend";
import { Button, cn } from "@vmem/ui";
import HeaderSearchInput from "@/components/_components/HeaderSearchInput";
import { sidebarSearchInputClassName } from "@/components/sidebar/sidebar-search-input";
import { useActiveTeamId } from "@/components/workspace/active-profile";
import type { WikiNodeId, WikiSearchHit } from "./-types";

interface WikiSearchResultItemProps {
  node: WikiSearchHit;
  onSelect: (id: WikiNodeId) => void;
  onClear: () => void;
}

function WikiSearchResultItem({
  node,
  onSelect,
  onClear,
}: WikiSearchResultItemProps) {
  if (node.kind === "folder") {
    return (
      <li>
        <Button
          type="button"
          variant="ghost"
          disabled
          className="h-auto w-full justify-start gap-2 rounded-md px-2 py-1.5 text-left text-sm font-normal text-foreground/90 hover:bg-surface-tertiary/50 active:scale-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <IconFolder className="size-3.5 shrink-0 text-muted" />
          <span className="truncate">{node.title}</span>
        </Button>
      </li>
    );
  }

  return (
    <li>
      <Button
        type="button"
        variant="ghost"
        onClick={() => {
          onSelect(node._id);
          onClear();
        }}
        className="h-auto w-full justify-start gap-2 rounded-md px-2 py-1.5 text-left text-sm font-normal text-foreground/90 hover:bg-surface-tertiary/50 active:scale-100"
      >
        {node.kind === "artifact" ? (
          <IconCode className="size-3.5 shrink-0 text-muted" />
        ) : (
          <IconFileText className="size-3.5 shrink-0 text-muted" />
        )}
        <span className="truncate">{node.title}</span>
      </Button>
    </li>
  );
}

interface WikiSearchProps {
  onSelect: (id: WikiNodeId) => void;
  // trailing chrome (add, select) beside the input
  actions?: ReactNode;
  className?: string;
}

// debounced wiki search (title + contentText, workspace-scoped)
export default function WikiSearch({
  onSelect,
  actions,
  className,
}: WikiSearchProps) {
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
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <div className="flex min-w-0 items-center gap-1">
        <HeaderSearchInput
          value={raw}
          onChange={setRaw}
          placeholder="Search"
          label="Search wiki"
          className="min-w-0 flex-1 sm:flex-1"
          inputClassName={sidebarSearchInputClassName}
        />
        {actions}
      </div>
      {isSearching ? (
        <div className="max-h-48 overflow-y-auto rounded-md scrollbar-thin">
          {results === undefined ? (
            <p className="px-2 py-1.5 text-xs text-muted">Searching…</p>
          ) : results.length === 0 ? (
            <p className="px-2 py-1.5 text-xs text-muted">No matches.</p>
          ) : (
            <ul className="flex flex-col">
              {results.map((node) => (
                <WikiSearchResultItem
                  key={node._id}
                  node={node}
                  onSelect={onSelect}
                  onClear={() => setRaw("")}
                />
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
