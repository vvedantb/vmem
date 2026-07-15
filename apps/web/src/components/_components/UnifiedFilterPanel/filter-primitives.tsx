"use client";

import type { ReactNode } from "react";
import { Button, Checkbox, cn, TabsPrimitive } from "@vmem/ui";
import { Virtuoso } from "react-virtuoso";
import { isCheckedByDefault, toggleCheckedByDefault } from "./checkedByDefault";

export function FilterTabContent({
  value,
  children,
}: {
  value: string;
  children: ReactNode;
}) {
  return (
    <TabsPrimitive.Content
      value={value}
      className="flex-1 flex flex-col overflow-hidden data-[state=inactive]:hidden"
    >
      {children}
    </TabsPrimitive.Content>
  );
}

export function AllFilterHeader({
  label,
  totalCount,
  isAllSelected,
  onSelectAll,
  trailing,
}: {
  label: string;
  totalCount: number;
  isAllSelected: boolean;
  onSelectAll: () => void;
  trailing?: ReactNode;
}) {
  const btn = (
    <Button
      type="button"
      variant="ghost"
      onClick={onSelectAll}
      className={cn(
        "h-auto justify-start gap-2 rounded-md px-2 py-1.5 text-xs transition-colors active:scale-100",
        trailing == null && "w-full",
        isAllSelected
          ? "bg-surface-secondary font-medium text-foreground hover:bg-surface-secondary"
          : "hover:bg-surface-tertiary",
      )}
    >
      {label}
      <span
        className={cn(
          "text-muted/50 tabular-nums",
          trailing == null && "ml-auto",
        )}
      >
        {totalCount}
      </span>
    </Button>
  );
  return (
    <div className="p-2 border-b border-separator">
      {trailing == null ? (
        btn
      ) : (
        <div className="flex items-center justify-between">
          {btn}
          {trailing}
        </div>
      )}
    </div>
  );
}

export function FilterCheckboxRow({
  checked,
  onToggle,
  label,
  count,
  leading,
}: {
  checked: boolean;
  onToggle: () => void;
  label: ReactNode;
  count?: number;
  leading?: ReactNode;
}) {
  return (
    <label className="flex items-center gap-2 px-3 py-2 cursor-pointer border-b border-separator last:border-0 hover:bg-surface-tertiary">
      <Checkbox checked={checked} onCheckedChange={onToggle} />
      {leading}
      <span className="flex-1 text-xs truncate">{label}</span>
      {count == null ? null : (
        <span className="text-xs text-muted/50 tabular-nums">{count}</span>
      )}
    </label>
  );
}

export function FilterOptionList<T extends string>({
  value,
  allLabel,
  totalCount,
  selected,
  onChange,
  options,
  formatLabel,
  counts,
  renderLeading,
}: {
  value: string;
  allLabel: string;
  totalCount: number;
  selected: T[];
  onChange?: (next: T[]) => void;
  options: readonly T[];
  formatLabel: (option: T) => string;
  counts: Record<T, number>;
  renderLeading?: (option: T) => ReactNode;
}) {
  return (
    <FilterTabContent value={value}>
      <AllFilterHeader
        label={allLabel}
        totalCount={totalCount}
        isAllSelected={selected.length === 0}
        onSelectAll={() => onChange?.([])}
      />
      <div className="flex-1 overflow-y-auto">
        {options.map((option) => (
          <FilterCheckboxRow
            key={option}
            checked={isCheckedByDefault(selected, option)}
            onToggle={() =>
              onChange?.(toggleCheckedByDefault(selected, option, options))
            }
            leading={renderLeading?.(option)}
            label={formatLabel(option)}
            count={counts[option]}
          />
        ))}
      </div>
    </FilterTabContent>
  );
}

export function VirtuosoFilterTab<T, C>({
  value,
  allLabel,
  totalCount,
  isAllSelected,
  onSelectAll,
  trailing,
  items,
  emptyMessage,
  context,
  computeItemKey,
  itemContent,
}: {
  value: string;
  allLabel: string;
  totalCount: number;
  isAllSelected: boolean;
  onSelectAll: () => void;
  trailing?: ReactNode;
  items: readonly T[];
  emptyMessage: string;
  context: C;
  computeItemKey: (index: number, item: T) => string;
  itemContent: (index: number, item: T, context: C) => ReactNode;
}) {
  return (
    <FilterTabContent value={value}>
      <AllFilterHeader
        label={allLabel}
        totalCount={totalCount}
        isAllSelected={isAllSelected}
        onSelectAll={onSelectAll}
        trailing={trailing}
      />
      {items.length === 0 ? (
        <div className="p-3 text-xs text-muted text-center">{emptyMessage}</div>
      ) : (
        <div className="flex-1 min-h-0">
          <Virtuoso
            data={items}
            context={context}
            computeItemKey={computeItemKey}
            fixedItemHeight={36}
            itemContent={itemContent}
            style={{ height: "100%" }}
          />
        </div>
      )}
    </FilterTabContent>
  );
}
