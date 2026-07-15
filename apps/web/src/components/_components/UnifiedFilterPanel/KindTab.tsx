import {
  formatListItemKindLabel,
  LIST_ITEM_KINDS,
  type ListItemKind,
} from "@/lib/list-items";
import { nodeColor } from "../graph-colors";
import ShapeIndicator from "../ShapeIndicator";
import { FilterOptionList } from "./filter-primitives";

export default function KindTab({
  selectedKinds,
  onKindsChange,
  kindCounts,
  totalCount,
  isDark,
}: {
  selectedKinds: ListItemKind[];
  onKindsChange?: (kinds: ListItemKind[]) => void;
  kindCounts: Record<ListItemKind, number>;
  totalCount: number;
  isDark: boolean;
}) {
  return (
    <FilterOptionList
      value="kind"
      allLabel="All kinds"
      totalCount={totalCount}
      selected={selectedKinds}
      onChange={onKindsChange}
      options={LIST_ITEM_KINDS}
      formatLabel={formatListItemKindLabel}
      counts={kindCounts}
      renderLeading={(kind) => (
        <ShapeIndicator
          kind={kind}
          color={nodeColor(
            [],
            kind === "wiki-artifact" ? "wiki-document" : kind,
            isDark,
            null,
          )}
        />
      )}
    />
  );
}
