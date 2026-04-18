import { useReducer, useCallback } from "react";

interface SelectionState {
  selectedIds: Set<string>;
  lastSelectedId: string | null;
}

type SelectionAction =
  | { type: "select"; id: string }
  | { type: "toggle"; id: string }
  | { type: "range"; id: string; orderedIds: string[] }
  | { type: "selectAll"; ids: string[] }
  | { type: "clear" };

function selectionReducer(
  state: SelectionState,
  action: SelectionAction,
): SelectionState {
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
      const rangeIds = action.orderedIds.slice(lo, hi + 1);
      return {
        selectedIds: new Set([...state.selectedIds, ...rangeIds]),
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

const initialState: SelectionState = {
  selectedIds: new Set(),
  lastSelectedId: null,
};

export function useFileSelection(orderedIds: string[]) {
  const [state, dispatch] = useReducer(selectionReducer, initialState);

  const handleClick = useCallback(
    (
      id: string,
      e: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean },
    ) => {
      if (e.shiftKey) {
        dispatch({ type: "range", id, orderedIds });
      } else if (e.ctrlKey || e.metaKey) {
        dispatch({ type: "toggle", id });
      } else {
        dispatch({ type: "select", id });
      }
    },
    [orderedIds],
  );

  const handleCheckbox = useCallback((id: string) => {
    dispatch({ type: "toggle", id });
  }, []);

  const handleSelectAll = useCallback(() => {
    if (state.selectedIds.size === orderedIds.length) {
      dispatch({ type: "clear" });
    } else {
      dispatch({ type: "selectAll", ids: orderedIds });
    }
  }, [orderedIds, state.selectedIds.size]);

  const clear = useCallback(() => {
    dispatch({ type: "clear" });
  }, []);

  const isSelected = useCallback(
    (id: string) => state.selectedIds.has(id),
    [state.selectedIds],
  );

  return {
    selectedIds: state.selectedIds,
    selectedCount: state.selectedIds.size,
    isAllSelected:
      orderedIds.length > 0 && state.selectedIds.size === orderedIds.length,
    isSelected,
    handleClick,
    handleCheckbox,
    handleSelectAll,
    clear,
  };
}
