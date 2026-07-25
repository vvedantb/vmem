import { useReducer, useRef, useState } from "react";

type SelectionState<T> = {
  selectedIds: Set<T>;
  lastSelectedId: T | null;
};

type SelectionAction<T> =
  | { type: "select"; id: T }
  | { type: "toggle"; id: T }
  | { type: "range"; id: T; orderedIds: readonly T[] }
  | { type: "selectAll"; ids: readonly T[] }
  | { type: "clear" };

function selectionReducer<T>(
  state: SelectionState<T>,
  action: SelectionAction<T>,
): SelectionState<T> {
  switch (action.type) {
    case "select":
      return {
        selectedIds: new Set([action.id]),
        lastSelectedId: action.id,
      };
    case "toggle": {
      const next = new Set(state.selectedIds);
      if (next.has(action.id)) {
        next.delete(action.id);
      } else {
        next.add(action.id);
      }
      return { selectedIds: next, lastSelectedId: action.id };
    }
    case "range": {
      if (state.lastSelectedId === null) {
        return {
          selectedIds: new Set([action.id]),
          lastSelectedId: action.id,
        };
      }
      const startIdx = action.orderedIds.indexOf(state.lastSelectedId);
      const endIdx = action.orderedIds.indexOf(action.id);
      if (startIdx === -1 || endIdx === -1) {
        return {
          selectedIds: new Set([action.id]),
          lastSelectedId: action.id,
        };
      }
      const lo = Math.min(startIdx, endIdx);
      const hi = Math.max(startIdx, endIdx);
      return {
        selectedIds: new Set([
          ...state.selectedIds,
          ...action.orderedIds.slice(lo, hi + 1),
        ]),
        lastSelectedId: action.id,
      };
    }
    case "selectAll":
      return {
        selectedIds: new Set(action.ids),
        lastSelectedId: state.lastSelectedId,
      };
    case "clear":
      return { selectedIds: new Set(), lastSelectedId: null };
  }
}

export type UseIdSelectionOptions<T> = {
  // enables shift-range + select-all against a stable visual order
  orderedIds?: readonly T[];
};

// shared id set selection for files (modifiers) and wiki/skills (bulk mode)
export function useIdSelection<T>(options: UseIdSelectionOptions<T> = {}) {
  const orderedIdsRef = useRef(options.orderedIds);
  orderedIdsRef.current = options.orderedIds;

  const [state, dispatch] = useReducer(
    (prev: SelectionState<T>, action: SelectionAction<T>) =>
      selectionReducer(prev, action),
    { selectedIds: new Set<T>(), lastSelectedId: null },
  );
  const [selectionMode, setSelectionMode] = useState(false);

  const clear = () => {
    dispatch({ type: "clear" });
  };

  const exitSelection = () => {
    setSelectionMode(false);
    dispatch({ type: "clear" });
  };

  const toggle = (id: T) => {
    dispatch({ type: "toggle", id });
  };

  const selectAll = () => {
    const orderedIds = orderedIdsRef.current;
    if (orderedIds === undefined) return;
    if (orderedIds.length > 0 && state.selectedIds.size === orderedIds.length) {
      dispatch({ type: "clear" });
      return;
    }
    dispatch({ type: "selectAll", ids: orderedIds });
  };

  const isSelected = (id: T) => state.selectedIds.has(id);

  const handleClick = (
    id: T,
    e: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean },
  ) => {
    if (e.shiftKey) {
      dispatch({
        type: "range",
        id,
        orderedIds: orderedIdsRef.current ?? [],
      });
    } else if (e.ctrlKey || e.metaKey) {
      dispatch({ type: "toggle", id });
    } else {
      dispatch({ type: "select", id });
    }
  };

  const orderedIds = options.orderedIds;

  return {
    selectedIds: state.selectedIds,
    selectedCount: state.selectedIds.size,
    isAllSelected:
      orderedIds !== undefined &&
      orderedIds.length > 0 &&
      state.selectedIds.size === orderedIds.length,
    isSelected,
    clear,
    toggle,
    selectAll,
    handleClick,
    handleCheckbox: toggle,
    handleSelectAll: selectAll,
    selectionMode,
    setSelectionMode,
    exitSelection,
    toggleSelect: toggle,
  };
}
