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
  nodesRef: { current: GraphNode[] },
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
        hitNode.fx = hitNode.x;
        hitNode.fy = hitNode.y;
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
      const node = nodesRef.current.find(
        (n) => n.id === interaction.draggedNodeId,
      );
      if (node) {
        node.fx = world.x;
        node.fy = world.y;
        node.x = world.x;
        node.y = world.y;
      }
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
      const node = nodesRef.current.find(
        (n) => n.id === interaction.draggedNodeId,
      );
      if (node) {
        node.fx = null;
        node.fy = null;
      }
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

  canvas.addEventListener("mousedown", onMouseDown);
  canvas.addEventListener("mousemove", onMouseMove);
  canvas.addEventListener("mouseup", onMouseUp);
  canvas.addEventListener("mouseleave", onMouseUp);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("dblclick", onDblClick);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);

  return () => {
    canvas.removeEventListener("mousedown", onMouseDown);
    canvas.removeEventListener("mousemove", onMouseMove);
    canvas.removeEventListener("mouseup", onMouseUp);
    canvas.removeEventListener("mouseleave", onMouseUp);
    canvas.removeEventListener("wheel", onWheel);
    canvas.removeEventListener("dblclick", onDblClick);
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
  };
}
