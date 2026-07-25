import {
  formatMemoryTypeLabel,
  MEMORY_TYPES,
  type MemoryType,
} from "@/lib/memories";
import { FilterOptionList } from "@/components/_components/FacetedFilter";

export default function TypeTab({
  selectedTypes,
  onTypesChange,
  typeCounts,
  totalCount,
}: {
  selectedTypes: MemoryType[];
  onTypesChange?: (types: MemoryType[]) => void;
  typeCounts: Record<MemoryType, number>;
  totalCount: number;
}) {
  return (
    <FilterOptionList
      value="type"
      allLabel="All types"
      totalCount={totalCount}
      selected={selectedTypes}
      onChange={onTypesChange}
      options={MEMORY_TYPES}
      formatLabel={formatMemoryTypeLabel}
      counts={typeCounts}
    />
  );
}
