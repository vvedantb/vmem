import type {
  GraphNode,
  InteractionState,
  ResolvedEdge,
  ViewportState,
} from "@/lib/graph/types";
import { screenToWorld, zoomAt } from "./viewport";
import { getEdgeAt, getNodeAt } from "./hit-test";
import type { createSpatialIndex } from "./hit-test";
import type { SimulationController } from "./simulation";

interface Callbacks {
  onHoverNode: (node: GraphNode | null) => void;
  onHoverEdge: (idx: number | null) => void;
  onClickNode: (nodeId: string) => void;
  onLinkNodes: (sourceId: string, targetId: string) => void;
  onFocusNode: (nodeId: string) => void;
}

interface CanvasInputTarget {
  clientWidth: number;
  clientHeight: number;
  style: { cursor: string };
  addEventListener: HTMLCanvasElement["addEventListener"];
  removeEventListener: HTMLCanvasElement["removeEventListener"];
  getBoundingClientRect: HTMLCanvasElement["getBoundingClientRect"];
  setPointerCapture: HTMLCanvasElement["setPointerCapture"];
  hasPointerCapture: HTMLCanvasElement["hasPointerCapture"];
  releasePointerCapture: HTMLCanvasElement["releasePointerCapture"];
}

interface PanSample {
  x: number;
  y: number;
  t: number;
}

type InputMode = "idle" | "node-drag" | "link" | "pan" | "pinch";

const DRAG_THRESHOLD_MOUSE = 3;
const DRAG_THRESHOLD_TOUCH = 5;
const TAP_MAX_MS = 300;
const MOMENTUM_MAX_MS = 200;

export function attachInputHandlers(
  canvas: CanvasInputTarget,
  interaction: InteractionState,
  viewport: ViewportState,
  simRef: { current: SimulationController | null },
  spatialIndexRef: {
    current: ReturnType<typeof createSpatialIndex>;
  },
  edgesRef: { current: ResolvedEdge[] },
  callbacks: Callbacks,
): () => void {
  let mode: InputMode = "idle";
  const activePointers = new Map<number, { x: number; y: number }>();
  let downX = 0;
  let downY = 0;
  let hasDragged = false;
  let downTime = 0;
  const panHistory: PanSample[] = [];

  let pinchStartDist = 0;
  let pinchStartScale = 1;
  let lastPinchCenterX = 0;
  let lastPinchCenterY = 0;

  function canvasSize(): { w: number; h: number } {
    return { w: canvas.clientWidth, h: canvas.clientHeight };
  }

  function clientCanvasXY(
    clientX: number,
    clientY: number,
  ): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  function pointerCanvasXY(e: PointerEvent): { x: number; y: number } {
    return clientCanvasXY(e.clientX, e.clientY);
  }

  function worldAt(screenX: number, screenY: number): { x: number; y: number } {
    const { w, h } = canvasSize();
    return screenToWorld(viewport, screenX, screenY, w, h);
  }

  function nodeAt(screenX: number, screenY: number): GraphNode | null {
    const world = worldAt(screenX, screenY);
    return getNodeAt(spatialIndexRef.current, world.x, world.y, viewport.scale);
  }

  function dragThreshold(pointerType: string): number {
    return pointerType === "touch"
      ? DRAG_THRESHOLD_TOUCH
      : DRAG_THRESHOLD_MOUSE;
  }

  function clearPanMomentum(): void {
    viewport.velocityX = 0;
    viewport.velocityY = 0;
  }

  function applyPanDelta(
    x: number,
    y: number,
    lastX: number,
    lastY: number,
  ): void {
    viewport.offsetX += x - lastX;
    viewport.offsetY += y - lastY;
    viewport.targetOffsetX = viewport.offsetX;
    viewport.targetOffsetY = viewport.offsetY;
  }

  function recordPanSample(x: number, y: number): void {
    panHistory.push({ x, y, t: performance.now() });
    if (panHistory.length > 4) panHistory.shift();
  }

  function applyPanMomentum(endX: number, endY: number): void {
    const oldest = panHistory.at(0);
    if (!oldest) return;
    const dt = performance.now() - oldest.t;
    if (dt < MOMENTUM_MAX_MS && dt > 0) {
      viewport.velocityX = (endX - oldest.x) / (dt / 16);
      viewport.velocityY = (endY - oldest.y) / (dt / 16);
    }
  }

  function pinchDistance(): number {
    const pts = [...activePointers.values()];
    const a = pts[0];
    const b = pts[1];
    if (!a || !b) return 0;
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function pinchCenter(): { x: number; y: number } {
    const pts = [...activePointers.values()];
    const a = pts[0];
    const b = pts[1];
    if (!a || !b) return { x: 0, y: 0 };
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  function enterPinchMode(): void {
    finishGesture({ allowClick: false });
    mode = "pinch";
    pinchStartDist = pinchDistance();
    pinchStartScale = viewport.targetScale;
    const center = pinchCenter();
    lastPinchCenterX = center.x;
    lastPinchCenterY = center.y;
  }

  function updateHover(screenX: number, screenY: number): void {
    if (Math.abs(viewport.targetScale - viewport.scale) > 0.001) {
      return;
    }

    const world = worldAt(screenX, screenY);
    const hitNode = getNodeAt(
      spatialIndexRef.current,
      world.x,
      world.y,
      viewport.scale,
    );
    const hoveredId = hitNode ? hitNode.id : null;
    if (hoveredId !== interaction.hoveredNodeId) {
      interaction.hoveredNodeId = hoveredId;
      callbacks.onHoverNode(hitNode);
      canvas.style.cursor = hitNode ? "pointer" : "default";
    }

    if (hitNode) {
      if (interaction.hoveredEdgeIndex !== null) {
        interaction.hoveredEdgeIndex = null;
        callbacks.onHoverEdge(null);
      }
      return;
    }

    const edgeIdx = getEdgeAt(
      edgesRef.current,
      world.x,
      world.y,
      viewport.scale,
    );
    if (edgeIdx !== interaction.hoveredEdgeIndex) {
      interaction.hoveredEdgeIndex = edgeIdx;
      callbacks.onHoverEdge(edgeIdx);
    }
  }

  function updateLinkHover(screenX: number, screenY: number): void {
    const world = worldAt(screenX, screenY);
    interaction.mouseWorldX = world.x;
    interaction.mouseWorldY = world.y;
    const hitNode = getNodeAt(
      spatialIndexRef.current,
      world.x,
      world.y,
      viewport.scale,
    );
    const hoveredId =
      hitNode && hitNode.id !== interaction.linkSourceId ? hitNode.id : null;
    if (hoveredId !== interaction.hoveredNodeId) {
      interaction.hoveredNodeId = hoveredId;
    }
    canvas.style.cursor = hoveredId ? "crosshair" : "default";
  }

  function onPointerDown(e: PointerEvent): void {
    if (e.button !== 0 && e.pointerType === "mouse") return;

    const { x, y } = pointerCanvasXY(e);
    activePointers.set(e.pointerId, { x, y });
    canvas.setPointerCapture(e.pointerId);

    if (activePointers.size === 2) {
      enterPinchMode();
      return;
    }

    if (activePointers.size !== 1) return;

    downX = x;
    downY = y;
    hasDragged = false;
    downTime = performance.now();
    panHistory.length = 0;
    panHistory.push({ x, y, t: downTime });
    clearPanMomentum();

    const hitNode = nodeAt(x, y);
    if (hitNode && e.shiftKey && e.pointerType === "mouse") {
      mode = "link";
      interaction.linkSourceId = hitNode.id;
      const world = worldAt(x, y);
      interaction.mouseWorldX = world.x;
      interaction.mouseWorldY = world.y;
      return;
    }

    if (hitNode) {
      mode = "node-drag";
      interaction.draggedNodeId = hitNode.id;
      simRef.current?.dragStart(hitNode.id, hitNode.x ?? 0, hitNode.y ?? 0);
      return;
    }

    mode = "pan";
    interaction.isPanning = true;
  }

  function onPointerMove(e: PointerEvent): void {
    const { x, y } = pointerCanvasXY(e);
    const stored = activePointers.get(e.pointerId);

    if (!stored) {
      if (mode === "idle" && activePointers.size === 0) {
        updateHover(x, y);
      }
      return;
    }

    if (mode === "pinch" && activePointers.size >= 2) {
      activePointers.set(e.pointerId, { x, y });
      const dist = pinchDistance();
      const center = pinchCenter();
      const scaleFactor = dist / pinchStartDist;
      const newScale = pinchStartScale * scaleFactor;
      const clampedScale = Math.max(0.1, Math.min(5, newScale));
      viewport.targetScale = clampedScale;
      viewport.scale = clampedScale;
      applyPanDelta(center.x, center.y, lastPinchCenterX, lastPinchCenterY);
      lastPinchCenterX = center.x;
      lastPinchCenterY = center.y;
      return;
    }

    const threshold = dragThreshold(e.pointerType);
    if (
      activePointers.size === 1 &&
      (Math.abs(x - downX) > threshold || Math.abs(y - downY) > threshold)
    ) {
      hasDragged = true;
    }

    if (mode === "link") {
      activePointers.set(e.pointerId, { x, y });
      updateLinkHover(x, y);
      return;
    }

    if (mode === "node-drag" && interaction.draggedNodeId) {
      activePointers.set(e.pointerId, { x, y });
      const world = worldAt(x, y);
      simRef.current?.dragMove(interaction.draggedNodeId, world.x, world.y);
      return;
    }

    if (mode === "pan" && interaction.isPanning) {
      applyPanDelta(x, y, stored.x, stored.y);
      activePointers.set(e.pointerId, { x, y });
      recordPanSample(x, y);
      return;
    }

    activePointers.set(e.pointerId, { x, y });
  }

  function finishGesture({
    allowClick,
    endX = downX,
    endY = downY,
    pointerType = "mouse",
    button = 0,
  }: {
    allowClick: boolean;
    endX?: number;
    endY?: number;
    pointerType?: string;
    button?: number;
  }): void {
    if (mode === "link" && interaction.linkSourceId) {
      const hitNode = nodeAt(endX, endY);
      if (hitNode && hitNode.id !== interaction.linkSourceId) {
        callbacks.onLinkNodes(interaction.linkSourceId, hitNode.id);
      }
    }
    interaction.linkSourceId = null;
    interaction.hoveredNodeId = null;

    if (mode === "node-drag" && interaction.draggedNodeId) {
      simRef.current?.dragEnd(interaction.draggedNodeId);
      interaction.draggedNodeId = null;
      simRef.current?.reheat();
    }

    if (mode === "pan" && interaction.isPanning && panHistory.length >= 2) {
      applyPanMomentum(endX, endY);
    }
    interaction.isPanning = false;

    if (
      allowClick &&
      !hasDragged &&
      pointerType === "touch" &&
      performance.now() - downTime < TAP_MAX_MS
    ) {
      const hitNode = nodeAt(downX, downY);
      if (hitNode) {
        callbacks.onClickNode(hitNode.id);
      }
    } else if (
      allowClick &&
      !hasDragged &&
      pointerType === "mouse" &&
      button === 0
    ) {
      const hitNode = nodeAt(endX, endY);
      if (hitNode) {
        callbacks.onClickNode(hitNode.id);
      }
    }

    canvas.style.cursor = "default";
    mode = "idle";
  }

  function finishPointer(e: PointerEvent, allowClick: boolean): void {
    const { x, y } = pointerCanvasXY(e);
    const hadCapture = activePointers.has(e.pointerId);
    activePointers.delete(e.pointerId);
    if (hadCapture && canvas.hasPointerCapture(e.pointerId)) {
      canvas.releasePointerCapture(e.pointerId);
    }

    if (activePointers.size > 0) {
      if (mode === "pinch" && activePointers.size === 1) {
        finishGesture({ allowClick: false, endX: x, endY: y });
      }
      return;
    }

    finishGesture({
      allowClick,
      endX: x,
      endY: y,
      pointerType: e.pointerType,
      button: e.button,
    });
  }

  function onWheel(e: WheelEvent): void {
    e.preventDefault();
    const { x, y } = clientCanvasXY(e.clientX, e.clientY);
    const { w, h } = canvasSize();
    const factor = e.deltaY > 0 ? 0.92 : 1.08;
    zoomAt(viewport, x, y, w, h, factor);
  }

  function onDblClick(e: MouseEvent): void {
    const { x, y } = clientCanvasXY(e.clientX, e.clientY);
    const hitNode = nodeAt(x, y);
    const { w, h } = canvasSize();
    if (hitNode) {
      callbacks.onFocusNode(hitNode.id);
    } else {
      zoomAt(viewport, x, y, w, h, 1.5);
    }
  }

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerCancel);
  canvas.addEventListener("pointerleave", onPointerCancel);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("dblclick", onDblClick);

  return () => {
    finishGesture({ allowClick: false });
    for (const pointerId of activePointers.keys()) {
      if (canvas.hasPointerCapture(pointerId)) {
        canvas.releasePointerCapture(pointerId);
      }
    }
    activePointers.clear();
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerup", onPointerUp);
    canvas.removeEventListener("pointercancel", onPointerCancel);
    canvas.removeEventListener("pointerleave", onPointerCancel);
    canvas.removeEventListener("wheel", onWheel);
    canvas.removeEventListener("dblclick", onDblClick);
  };

  function onPointerUp(e: PointerEvent): void {
    finishPointer(e, true);
  }

  function onPointerCancel(e: PointerEvent): void {
    finishPointer(e, false);
  }
}
