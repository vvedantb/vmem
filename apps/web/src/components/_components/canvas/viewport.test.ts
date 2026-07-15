import { describe, expect, it } from "vitest";
import { createViewport, fitToNodes, screenToWorld, zoomAt } from "./viewport";

describe("zoomAt", () => {
  it("anchors zoom to the pointer world position", () => {
    const vp = createViewport();
    vp.offsetX = 100;
    vp.offsetY = 50;
    vp.scale = 1;
    vp.targetScale = 1;

    zoomAt(vp, 400, 300, 800, 600, 2);

    const before = screenToWorld(vp, 400, 300, 800, 600);
    vp.scale = vp.targetScale;
    vp.offsetX = vp.targetOffsetX;
    vp.offsetY = vp.targetOffsetY;
    const after = screenToWorld(vp, 400, 300, 800, 600);

    expect(after.x).toBeCloseTo(before.x, 5);
    expect(after.y).toBeCloseTo(before.y, 5);
    expect(vp.targetScale).toBe(2);
  });

  it("clamps zoom to min and max scale", () => {
    const low = createViewport();
    zoomAt(low, 0, 0, 800, 600, 0.001);
    expect(low.targetScale).toBe(0.01);

    const high = createViewport();
    zoomAt(high, 0, 0, 800, 600, 100);
    expect(high.targetScale).toBe(5);
  });

  it("clears pan momentum on zoom", () => {
    const vp = createViewport();
    vp.velocityX = 10;
    vp.velocityY = -5;
    zoomAt(vp, 100, 100, 800, 600, 1.1);
    expect(vp.velocityX).toBe(0);
    expect(vp.velocityY).toBe(0);
  });
});

describe("fitToNodes", () => {
  it("frames node bounds with padding", () => {
    const vp = createViewport();
    fitToNodes(
      vp,
      [
        { x: -100, y: -50 },
        { x: 100, y: 50 },
      ],
      800,
      600,
      80,
    );

    expect(vp.targetScale).toBeCloseTo(3.2, 5);
    expect(vp.targetOffsetX).toBeCloseTo(0, 5);
    expect(vp.targetOffsetY).toBeCloseTo(0, 5);
  });

  it("no-ops on empty node list", () => {
    const vp = createViewport();
    fitToNodes(vp, [], 800, 600);
    expect(vp.targetScale).toBe(1);
    expect(vp.targetOffsetX).toBe(0);
  });
});

describe("screenToWorld", () => {
  it("maps screen center to world origin at default viewport", () => {
    const vp = createViewport();
    const world = screenToWorld(vp, 400, 300, 800, 600);
    expect(world.x).toBeCloseTo(0, 5);
    expect(world.y).toBeCloseTo(0, 5);
  });
});
