// checked-by-default multi-select semantics for enumerable filter tabs (Kind / Type / Source)

// checkbox state: in the empty "all" default every option reads checked
export function isCheckedByDefault<T extends string>(
  selected: readonly T[],
  option: T,
): boolean {
  return selected.length === 0 || selected.includes(option);
}

// toggle one option
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
