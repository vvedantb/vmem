import type { Ref } from "react";

// forward a node to a callback or object ref (the two shapes forwardRef hands us)
export function assignRef<T>(ref: Ref<T> | undefined, node: T): void {
  if (typeof ref === "function") {
    ref(node);
  } else if (ref) {
    ref.current = node;
  }
}
