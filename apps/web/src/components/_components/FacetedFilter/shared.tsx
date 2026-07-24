import type { ReactNode } from "react";

// opt, in multi, select: empty array means "no filter"
export function toggleArrayItem<T>(selected: readonly T[], item: T): T[] {
  if (selected.includes(item)) {
    return selected.filter((value) => value !== item);
  }
  return [...selected, item];
}

// checked, by, default multi, select: empty array means "all selected"
export function isCheckedByDefault<T extends string>(
  selected: readonly T[],
  option: T,
): boolean {
  return selected.length === 0 || selected.includes(option);
}

export function toggleCheckedByDefault<T extends string>(
  selected: readonly T[],
  option: T,
  allOptions: readonly T[],
): T[] {
  if (selected.length === 0) {
    return allOptions.filter((o) => o !== option);
  }
  const next = selected.includes(option)
    ? selected.filter((o) => o !== option)
    : [...selected, option];
  if (next.length === 0 || allOptions.every((o) => next.includes(o))) {
    return [];
  }
  return next;
}

export function FacetedFilterBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-medium leading-none tabular-nums text-accent-foreground">
      {count}
    </span>
  );
}

export function FacetedFilterOption({
  icon,
  children,
}: {
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <span className="flex items-center gap-2">
      <span className="flex shrink-0 text-muted [&>svg]:size-4">{icon}</span>
      {children}
    </span>
  );
}
