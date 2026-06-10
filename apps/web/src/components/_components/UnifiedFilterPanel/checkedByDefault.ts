/**
 * Checked-by-default multi-select semantics for enumerable filter tabs
 * (Kind / Type / Source). The stored selection keeps the empty-=-"all"
 * convention (clean URLs, filter-count badge keys off non-empty fields), but
 * the checkboxes RENDER as all-checked in that default state so the panel
 * reads "everything visible" instead of "nothing selected".
 */

/** Checkbox state: in the empty "all" default every option reads checked. */
export function isCheckedByDefault<T extends string>(
  selected: readonly T[],
  option: T,
): boolean {
  return selected.length === 0 || selected.includes(option);
}

/**
 * Toggle one option. From the all-checked default, unchecking selects every
 * option except the toggled one. Re-checking the last missing option — or
 * unchecking the only remaining one (selecting nothing is never useful) —
 * normalizes back to the empty "all" state.
 */
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
