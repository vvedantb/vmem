import { useState } from "react";
import { useQuery } from "convex/react";
import { useDebounceValue } from "usehooks-ts";
import { IconCode, IconFileText, IconFolder } from "@tabler/icons-react";
import { api } from "@vmem/backend";
import { Button } from "@vmem/ui";
import HeaderSearchPopover from "@/components/_components/HeaderSearchPopover";
import { featureHeaderIconClassName } from "@/components/shell/FeatureAddMenu";
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
  query: string;
  onQueryChange: (query: string) => void;
  onSelect: (id: WikiNodeId) => void;
}

// icon search button + popover with debounced wiki results (title +
// contentText, workspace scoped)
export default function WikiSearch({
  query,
  onQueryChange,
  onSelect,
}: WikiSearchProps) {
  const [open, setOpen] = useState(false);
  const [debounced] = useDebounceValue(query, 200);
  const teamId = useActiveTeamId();

  const trimmed = debounced.trim();
  const results = useQuery(
    api.wiki.search,
    trimmed.length > 0 ? { queryText: trimmed, teamId } : "skip",
  );

  const isSearching = query.trim().length > 0;

  return (
    <HeaderSearchPopover
      value={query}
      onChange={onQueryChange}
      label="Search wiki"
      placeholder="Search"
      variant="ghost"
      triggerClassName={featureHeaderIconClassName}
      open={open}
      onOpenChange={setOpen}
    >
      {isSearching ? (
        <div className="max-h-64 overflow-y-auto rounded-md scrollbar-thin">
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
                  onClear={() => {
                    onQueryChange("");
                    setOpen(false);
                  }}
                />
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </HeaderSearchPopover>
  );
}
