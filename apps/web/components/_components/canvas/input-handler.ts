import type { GraphNode, InteractionState, ViewportState } from "./types";
import { screenToWorld, zoomAt } from "./viewport";
import { getNodeAt } from "./hit-test";
import type { SimulationController } from "./simulation";

interface Callbacks {
  onHoverNode: (node: GraphNode | null) => void;
  onClickNode: (nodeId: string) => void;
  onLinkNodes: (sourceId: string, targetId: string) => void;
}

interface PanSample {
  x: number;
  y: number;
  t: number;
}

export function attachInputHandlers(
  canvas: HTMLCanvasElement,
  interaction: InteractionState,
  viewport: ViewportState,
  simRef: { current: SimulationController | null },
  spatialIndexRef: {
    current: ReturnType<typeof import("./hit-test").createSpatialIndex>;
  },
  callbacks: Callbacks,
): () => void {
  let mouseDown = false;
  let mouseDownX = 0;
  let mouseDownY = 0;
  let hasDragged = false;
  const panHistory: PanSample[] = [];

  function getCanvasXY(e: MouseEvent): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function onMouseDown(e: MouseEvent) {
    const { x, y } = getCanvasXY(e);
    mouseDown = true;
    mouseDownX = x;
    mouseDownY = y;
    hasDragged = false;
    interaction.shiftHeld = e.shiftKey;
    panHistory.length = 0;
    panHistory.push({ x, y, t: performance.now() });

    viewport.velocityX = 0;
    viewport.velocityY = 0;

    const world = screenToWorld(
      viewport,
      x,
      y,
      canvas.clientWidth,
      canvas.clientHeight,
    );
    const hitNode = getNodeAt(
      spatialIndexRef.current,
      world.x,
      world.y,
      viewport.scale,
    );

    if (hitNode) {
      if (e.shiftKey) {
        interaction.linkSourceId = hitNode.id;
        interaction.mouseWorldX = world.x;
        interaction.mouseWorldY = world.y;
      } else {
        interaction.draggedNodeId = hitNode.id;
        simRef.current?.dragStart(hitNode.id, hitNode.x ?? 0, hitNode.y ?? 0);
      }
    } else {
      interaction.isPanning = true;
    }
  }

  function onMouseMove(e: MouseEvent) {
    const { x, y } = getCanvasXY(e);
    const world = screenToWorld(
      viewport,
      x,
      y,
      canvas.clientWidth,
      canvas.clientHeight,
    );

    if (
      mouseDown &&
      (Math.abs(x - mouseDownX) > 3 || Math.abs(y - mouseDownY) > 3)
    ) {
      hasDragged = true;
    }

    if (interaction.linkSourceId) {
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
      return;
    }

    if (interaction.draggedNodeId) {
      simRef.current?.dragMove(interaction.draggedNodeId, world.x, world.y);
      return;
    }

    if (interaction.isPanning) {
      const last = panHistory[panHistory.length - 1];
      if (last) {
        viewport.offsetX += x - last.x;
        viewport.offsetY += y - last.y;
        viewport.targetOffsetX = viewport.offsetX;
        viewport.targetOffsetY = viewport.offsetY;
      }
      panHistory.push({ x, y, t: performance.now() });
      if (panHistory.length > 4) panHistory.shift();
      return;
    }

    // Hover detection
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
  }

  function onMouseUp(e: MouseEvent) {
    const { x, y } = getCanvasXY(e);

    if (interaction.linkSourceId) {
      const world = screenToWorld(
        viewport,
        x,
        y,
        canvas.clientWidth,
        canvas.clientHeight,
      );
      const hitNode = getNodeAt(
        spatialIndexRef.current,
        world.x,
        world.y,
        viewport.scale,
      );
      if (hitNode && hitNode.id !== interaction.linkSourceId) {
        callbacks.onLinkNodes(interaction.linkSourceId, hitNode.id);
      }
      interaction.linkSourceId = null;
      interaction.hoveredNodeId = null;
      canvas.style.cursor = "default";
    }

    if (interaction.draggedNodeId) {
      simRef.current?.dragEnd(interaction.draggedNodeId);
      interaction.draggedNodeId = null;
      simRef.current?.reheat();
    }

    if (interaction.isPanning && panHistory.length >= 2) {
      const now = performance.now();
      const oldest = panHistory[0];
      const dt = now - oldest.t;
      if (dt < 200 && dt > 0) {
        viewport.velocityX = (x - oldest.x) / (dt / 16);
        viewport.velocityY = (y - oldest.y) / (dt / 16);
      }
      interaction.isPanning = false;
    }

    if (!hasDragged && mouseDown) {
      const world = screenToWorld(
        viewport,
        x,
        y,
        canvas.clientWidth,
        canvas.clientHeight,
      );
      const hitNode = getNodeAt(
        spatialIndexRef.current,
        world.x,
        world.y,
        viewport.scale,
      );
      if (hitNode) {
        callbacks.onClickNode(hitNode.id);
      }
    }

    mouseDown = false;
    interaction.isPanning = false;
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    const { x, y } = getCanvasXY(e);
    const factor = e.deltaY > 0 ? 0.92 : 1.08;
    zoomAt(viewport, x, y, canvas.clientWidth, canvas.clientHeight, factor);
  }

  function onDblClick(e: MouseEvent) {
    const { x, y } = getCanvasXY(e);
    zoomAt(viewport, x, y, canvas.clientWidth, canvas.clientHeight, 1.5);
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Shift") interaction.shiftHeld = true;
  }

  function onKeyUp(e: KeyboardEvent) {
    if (e.key === "Shift") interaction.shiftHeld = false;
  }

  // --- Touch support ---
  let pinchStartDist = 0;
  let pinchStartScale = 1;
  let lastTouchX = 0;
  let lastTouchY = 0;
  let touchStartTime = 0;
  let touchStartX = 0;
  let touchStartY = 0;
  let touchHasDragged = false;

  function getTouchCanvasXY(touch: Touch): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
  }

  function getPinchDist(t1: Touch, t2: Touch): number {
    const dx = t1.clientX - t2.clientX;
    const dy = t1.clientY - t2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function getPinchCenter(t1: Touch, t2: Touch): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (t1.clientX + t2.clientX) / 2 - rect.left,
      y: (t1.clientY + t2.clientY) / 2 - rect.top,
    };
  }

  function onTouchStart(e: TouchEvent) {
    e.preventDefault();

    if (e.touches.length === 2) {
      // Pinch start — release any single-touch state
      interaction.draggedNodeId = null;
      interaction.isPanning = false;
      pinchStartDist = getPinchDist(e.touches[0], e.touches[1]);
      pinchStartScale = viewport.targetScale;
      const center = getPinchCenter(e.touches[0], e.touches[1]);
      lastTouchX = center.x;
      lastTouchY = center.y;
      return;
    }

    const touch = e.touches[0];
    const { x, y } = getTouchCanvasXY(touch);
    lastTouchX = x;
    lastTouchY = y;
    touchStartX = x;
    touchStartY = y;
    touchStartTime = performance.now();
    touchHasDragged = false;

    viewport.velocityX = 0;
    viewport.velocityY = 0;
    panHistory.length = 0;
    panHistory.push({ x, y, t: performance.now() });

    const world = screenToWorld(
      viewport,
      x,
      y,
      canvas.clientWidth,
      canvas.clientHeight,
    );
    const hitNode = getNodeAt(
      spatialIndexRef.current,
      world.x,
      world.y,
      viewport.scale,
    );

    if (hitNode) {
      interaction.draggedNodeId = hitNode.id;
      simRef.current?.dragStart(hitNode.id, hitNode.x ?? 0, hitNode.y ?? 0);
    } else {
      interaction.isPanning = true;
    }
  }

  function onTouchMove(e: TouchEvent) {
    e.preventDefault();

    if (e.touches.length === 2) {
      const dist = getPinchDist(e.touches[0], e.touches[1]);
      const center = getPinchCenter(e.touches[0], e.touches[1]);

      // Pinch zoom
      const scaleFactor = dist / pinchStartDist;
      const newScale = pinchStartScale * scaleFactor;
      const clampedScale = Math.max(0.1, Math.min(5, newScale));
      viewport.targetScale = clampedScale;
      viewport.scale = clampedScale;

      // Pan with pinch center
      viewport.offsetX += center.x - lastTouchX;
      viewport.offsetY += center.y - lastTouchY;
      viewport.targetOffsetX = viewport.offsetX;
      viewport.targetOffsetY = viewport.offsetY;
      lastTouchX = center.x;
      lastTouchY = center.y;
      return;
    }

    const touch = e.touches[0];
    const { x, y } = getTouchCanvasXY(touch);

    if (Math.abs(x - touchStartX) > 5 || Math.abs(y - touchStartY) > 5) {
      touchHasDragged = true;
    }

    if (interaction.draggedNodeId) {
      const world = screenToWorld(
        viewport,
        x,
        y,
        canvas.clientWidth,
        canvas.clientHeight,
      );
      simRef.current?.dragMove(interaction.draggedNodeId, world.x, world.y);
      lastTouchX = x;
      lastTouchY = y;
      return;
    }

    if (interaction.isPanning) {
      viewport.offsetX += x - lastTouchX;
      viewport.offsetY += y - lastTouchY;
      viewport.targetOffsetX = viewport.offsetX;
      viewport.targetOffsetY = viewport.offsetY;
      panHistory.push({ x, y, t: performance.now() });
      if (panHistory.length > 4) panHistory.shift();
    }

    lastTouchX = x;
    lastTouchY = y;
  }

  function onTouchEnd(e: TouchEvent) {
    e.preventDefault();

    // If still two fingers, ignore partial lift
    if (e.touches.length > 0) return;

    if (interaction.draggedNodeId) {
      simRef.current?.dragEnd(interaction.draggedNodeId);
      interaction.draggedNodeId = null;
      simRef.current?.reheat();
    }

    // Momentum pan
    if (interaction.isPanning && panHistory.length >= 2) {
      const now = performance.now();
      const oldest = panHistory[0];
      const dt = now - oldest.t;
      if (dt < 200 && dt > 0) {
        viewport.velocityX = (lastTouchX - oldest.x) / (dt / 16);
        viewport.velocityY = (lastTouchY - oldest.y) / (dt / 16);
      }
    }
    interaction.isPanning = false;

    // Tap detection
    if (!touchHasDragged && performance.now() - touchStartTime < 300) {
      const world = screenToWorld(
        viewport,
        touchStartX,
        touchStartY,
        canvas.clientWidth,
        canvas.clientHeight,
      );
      const hitNode = getNodeAt(
        spatialIndexRef.current,
        world.x,
        world.y,
        viewport.scale,
      );
      if (hitNode) {
        callbacks.onClickNode(hitNode.id);
      }
    }
  }

  canvas.addEventListener("mousedown", onMouseDown);
  canvas.addEventListener("mousemove", onMouseMove);
  canvas.addEventListener("mouseup", onMouseUp);
  canvas.addEventListener("mouseleave", onMouseUp);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("dblclick", onDblClick);
  canvas.addEventListener("touchstart", onTouchStart, { passive: false });
  canvas.addEventListener("touchmove", onTouchMove, { passive: false });
  canvas.addEventListener("touchend", onTouchEnd, { passive: false });
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);

  return () => {
    canvas.removeEventListener("mousedown", onMouseDown);
    canvas.removeEventListener("mousemove", onMouseMove);
    canvas.removeEventListener("mouseup", onMouseUp);
    canvas.removeEventListener("mouseleave", onMouseUp);
    canvas.removeEventListener("wheel", onWheel);
    canvas.removeEventListener("dblclick", onDblClick);
    canvas.removeEventListener("touchstart", onTouchStart);
    canvas.removeEventListener("touchmove", onTouchMove);
    canvas.removeEventListener("touchend", onTouchEnd);
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
  };
}
