import type { Graph } from "@cosmos.gl/graph";
import type { CosmosGraphBuffers } from "./cosmos-adapters";

export interface CosmosLinkGestureCallbacks {
  onLinkNodes: (sourceId: string, targetId: string) => void;
  /** Called when link-target outline should update (undefined = clear). */
  onLinkTargetChange: (targetIndex: number | undefined) => void;
  getStrokeColor: () => string;
}

export interface CosmosLinkGestureRefs {
  getGraph: () => Graph | null;
  getBuffers: () => CosmosGraphBuffers | null;
  getHoveredIndex: () => number | undefined;
}

/**
 * Shift+pointerdown on a hovered node → rubber-band link create.
 * Disables Cosmos drag for the gesture so it does not steal the pointer.
 */
export function attachCosmosLinkGesture(
  root: HTMLElement,
  lineEl: SVGLineElement,
  refs: CosmosLinkGestureRefs,
  callbacks: CosmosLinkGestureCallbacks,
): () => void {
  let sourceIndex: number | undefined;
  let activePointerId: number | undefined;

  function setLineVisible(visible: boolean): void {
    lineEl.style.display = visible ? "block" : "none";
  }

  function updateLine(x1: number, y1: number, x2: number, y2: number): void {
    lineEl.setAttribute("x1", String(x1));
    lineEl.setAttribute("y1", String(y1));
    lineEl.setAttribute("x2", String(x2));
    lineEl.setAttribute("y2", String(y2));
    lineEl.setAttribute("stroke", callbacks.getStrokeColor());
  }

  function sourceScreenPos(
    graph: Graph,
    index: number,
  ): [number, number] | null {
    const positions = graph.getPointPositions();
    const sx = positions[index * 2];
    const sy = positions[index * 2 + 1];
    if (sx === undefined || sy === undefined) return null;
    return graph.spaceToScreenPosition([sx, sy]);
  }

  function localXY(e: PointerEvent): { x: number; y: number } {
    const rect = root.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function endLink(targetIndex: number | undefined): void {
    const buffers = refs.getBuffers();
    const graph = refs.getGraph();
    if (
      sourceIndex !== undefined &&
      targetIndex !== undefined &&
      targetIndex !== sourceIndex &&
      buffers
    ) {
      const sourceId = buffers.indexToId[sourceIndex];
      const targetId = buffers.indexToId[targetIndex];
      if (sourceId !== undefined && targetId !== undefined) {
        callbacks.onLinkNodes(sourceId, targetId);
      }
    }

    sourceIndex = undefined;
    activePointerId = undefined;
    setLineVisible(false);
    callbacks.onLinkTargetChange(undefined);
    if (graph) {
      graph.setConfigPartial({ enableDrag: true });
    }
  }

  function onPointerDown(e: PointerEvent): void {
    if (!e.shiftKey || e.pointerType !== "mouse" || e.button !== 0) return;
    const hovered = refs.getHoveredIndex();
    if (hovered === undefined) return;

    const graph = refs.getGraph();
    if (!graph) return;

    // Claim the gesture before Cosmos drag starts
    e.preventDefault();
    e.stopPropagation();

    sourceIndex = hovered;
    activePointerId = e.pointerId;
    root.setPointerCapture(e.pointerId);

    graph.setConfigPartial({ enableDrag: false });

    const origin = sourceScreenPos(graph, hovered);
    const { x, y } = localXY(e);
    if (origin) {
      updateLine(origin[0], origin[1], x, y);
      setLineVisible(true);
    }
  }

  function onPointerMove(e: PointerEvent): void {
    if (activePointerId !== e.pointerId || sourceIndex === undefined) return;
    const graph = refs.getGraph();
    if (!graph) return;

    const origin = sourceScreenPos(graph, sourceIndex);
    const { x, y } = localXY(e);
    if (origin) {
      updateLine(origin[0], origin[1], x, y);
    }

    const hovered = refs.getHoveredIndex();
    const target =
      hovered !== undefined && hovered !== sourceIndex ? hovered : undefined;
    callbacks.onLinkTargetChange(target);
  }

  function onPointerUp(e: PointerEvent): void {
    if (activePointerId !== e.pointerId) return;
    if (root.hasPointerCapture(e.pointerId)) {
      root.releasePointerCapture(e.pointerId);
    }
    const target = refs.getHoveredIndex();
    endLink(target);
  }

  function onPointerCancel(e: PointerEvent): void {
    if (activePointerId !== e.pointerId) return;
    if (root.hasPointerCapture(e.pointerId)) {
      root.releasePointerCapture(e.pointerId);
    }
    endLink(undefined);
  }

  function onKeyUp(e: KeyboardEvent): void {
    if (e.key !== "Shift" || sourceIndex === undefined) return;
    endLink(undefined);
  }

  setLineVisible(false);
  lineEl.setAttribute("stroke-width", "2");
  lineEl.setAttribute("stroke-dasharray", "6 4");
  lineEl.setAttribute("fill", "none");

  root.addEventListener("pointerdown", onPointerDown, true);
  root.addEventListener("pointermove", onPointerMove);
  root.addEventListener("pointerup", onPointerUp);
  root.addEventListener("pointercancel", onPointerCancel);
  window.addEventListener("keyup", onKeyUp);

  return () => {
    if (sourceIndex !== undefined) {
      endLink(undefined);
    }
    root.removeEventListener("pointerdown", onPointerDown, true);
    root.removeEventListener("pointermove", onPointerMove);
    root.removeEventListener("pointerup", onPointerUp);
    root.removeEventListener("pointercancel", onPointerCancel);
    window.removeEventListener("keyup", onKeyUp);
  };
}
