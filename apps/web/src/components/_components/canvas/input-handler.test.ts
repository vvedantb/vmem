// AI-generated (Claude), prompt: "test canvas input handlers for pointer drag zoom and selection"
// Modified by me: swapped in a lightweight test canvas stub
import { describe, expect, it, vi } from "vitest";
import type {
  GraphNode,
  InteractionState,
  ResolvedEdge,
} from "@/lib/graph/types";
import { createViewport } from "./viewport";
import { attachInputHandlers } from "./input-handler";
import { createSpatialIndex, rebuildIndex } from "./hit-test";
import type { SimulationController } from "./simulation";

class TestRect implements DOMRect {
  readonly x = 0;
  readonly y = 0;
  readonly width = 800;
  readonly height = 600;
  readonly top = 0;
  readonly right = 800;
  readonly bottom = 600;
  readonly left = 0;

  toJSON(): unknown {
    return {
      x: this.x,
      y: this.y,
      width: this.width,
      height: this.height,
      top: this.top,
      right: this.right,
      bottom: this.bottom,
      left: this.left,
    };
  }
}

class TestCanvas {
  readonly clientWidth = 800;
  readonly clientHeight = 600;
  readonly style = { cursor: "default" };
  private readonly listeners = new Map<string, EventListener[]>();
  private readonly capturedPointers = new Set<number>();

  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
  ): void {
    if (typeof listener !== "function") return;
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
  ): void {
    if (typeof listener !== "function") return;
    this.listeners.set(
      type,
      (this.listeners.get(type) ?? []).filter((item) => item !== listener),
    );
  }

  getBoundingClientRect(): DOMRect {
    return new TestRect();
  }

  setPointerCapture(pointerId: number): void {
    this.capturedPointers.add(pointerId);
  }

  hasPointerCapture(pointerId: number): boolean {
    return this.capturedPointers.has(pointerId);
  }

  releasePointerCapture(pointerId: number): void {
    this.capturedPointers.delete(pointerId);
  }

  dispatch(event: Event): void {
    for (const listener of this.listeners.get(event.type) ?? []) {
      listener(event);
    }
  }
}

class TestSimulation implements SimulationController {
  readonly dragStart = vi.fn();
  readonly dragMove = vi.fn();
  readonly dragEnd = vi.fn();
  readonly reheat = vi.fn();
  readonly tick = vi.fn();
  readonly stop = vi.fn();
  readonly setStrength = vi.fn();
  readonly setGravity = vi.fn();

  alpha(): number {
    return 0;
  }

  positionsVersion(): number {
    return 0;
  }
}

function graphNode(id: string): GraphNode {
  return {
    id,
    title: id,
    tags: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    size: 10,
    kind: "memory",
    sourceType: null,
    x: 0,
    y: 0,
  };
}

function interactionState(): InteractionState {
  return {
    hoveredNodeId: null,
    hoveredEdgeIndex: null,
    draggedNodeId: null,
    isPanning: false,
  };
}

function pointerEvent(
  type: string,
  init: {
    pointerId: number;
    clientX: number;
    clientY: number;
    pointerType?: string;
    button?: number;
  },
): Event {
  const event = new Event(type);
  Object.defineProperty(event, "pointerId", { value: init.pointerId });
  Object.defineProperty(event, "clientX", { value: init.clientX });
  Object.defineProperty(event, "clientY", { value: init.clientY });
  Object.defineProperty(event, "pointerType", {
    value: init.pointerType ?? "mouse",
  });
  Object.defineProperty(event, "button", { value: init.button ?? 0 });
  return event;
}

function setup() {
  const canvas = new TestCanvas();
  const interaction = interactionState();
  const viewport = createViewport();
  const sim = new TestSimulation();
  const spatialIndex = createSpatialIndex();
  rebuildIndex(spatialIndex, [graphNode("node-a")]);

  const callbacks = {
    onHoverNode: vi.fn(),
    onHoverEdge: vi.fn(),
    onClickNode: vi.fn(),
    onFocusNode: vi.fn(),
  };

  const cleanup = attachInputHandlers(
    canvas,
    interaction,
    viewport,
    { current: sim },
    { current: spatialIndex },
    { current: [] satisfies ResolvedEdge[] },
    callbacks,
  );

  return { canvas, interaction, sim, callbacks, cleanup };
}

describe("attachInputHandlers gesture teardown", () => {
  it("does not turn pointercancel into a click", () => {
    const { canvas, callbacks, cleanup } = setup();

    canvas.dispatch(
      pointerEvent("pointerdown", { pointerId: 1, clientX: 400, clientY: 300 }),
    );
    canvas.dispatch(
      pointerEvent("pointercancel", {
        pointerId: 1,
        clientX: 400,
        clientY: 300,
      }),
    );
    cleanup();

    expect(callbacks.onClickNode).not.toHaveBeenCalled();
  });

  it("releases an active simulation drag when pinch begins", () => {
    const { canvas, interaction, sim, cleanup } = setup();

    canvas.dispatch(
      pointerEvent("pointerdown", { pointerId: 1, clientX: 400, clientY: 300 }),
    );
    canvas.dispatch(
      pointerEvent("pointerdown", {
        pointerId: 2,
        clientX: 450,
        clientY: 300,
        pointerType: "touch",
      }),
    );
    cleanup();

    expect(sim.dragStart).toHaveBeenCalledWith("node-a", 0, 0);
    expect(sim.dragEnd).toHaveBeenCalledWith("node-a");
    expect(interaction.draggedNodeId).toBeNull();
  });

  it("releases an active simulation drag on cleanup", () => {
    const { canvas, interaction, sim, cleanup } = setup();

    canvas.dispatch(
      pointerEvent("pointerdown", { pointerId: 1, clientX: 400, clientY: 300 }),
    );
    cleanup();

    expect(sim.dragEnd).toHaveBeenCalledWith("node-a");
    expect(interaction.draggedNodeId).toBeNull();
  });
});
