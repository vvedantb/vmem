import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import GraphRenderer from "./GraphRenderer";
import type { GraphThemeColors, HoveredNodeInfo } from "./graph-types";

// Mock Sigma since it requires canvas
vi.mock("sigma", () => ({
  default: function (this: object) {
    Object.assign(this, {
      on: vi.fn(),
      kill: vi.fn(),
      getCamera: () => ({
        animatedZoom: vi.fn(),
        animatedUnzoom: vi.fn(),
        animatedReset: vi.fn(),
        animate: vi.fn(),
      }),
      getNodeDisplayData: vi.fn(() => ({ x: 0.5, y: 0.5 })),
    });
  },
}));

// Mock graphology Graph
const mockGraph = {
  nodes: vi.fn(() => ["node1", "node2"]),
  getNodeAttributes: vi.fn(() => ({
    label: "Test Node",
    content: "Node content",
    tags: [],
    createdAt: "2024-01-01",
    size: 5,
    color: "#fff",
    x: 0,
    y: 0,
  })),
};

const themeColors: GraphThemeColors = {
  labelColor: "#000",
  edgeColor: "#ccc",
  defaultNodeColor: "#fff",
};

describe("GraphRenderer", () => {
  const onHoverNode = vi.fn();
  const onClickNode = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders node and connection counts", () => {
    render(
      <GraphRenderer
        graph={mockGraph as never}
        onHoverNode={onHoverNode}
        onClickNode={onClickNode}
        themeColors={themeColors}
        nodeCount={5}
        connectionCount={8}
      />,
    );

    expect(screen.getByText("5 memories")).toBeDefined();
    expect(screen.getByText("8 connections")).toBeDefined();
  });

  it("renders zoom buttons with aria-labels", () => {
    render(
      <GraphRenderer
        graph={mockGraph as never}
        onHoverNode={onHoverNode}
        onClickNode={onClickNode}
        themeColors={themeColors}
        nodeCount={0}
        connectionCount={0}
      />,
    );

    expect(screen.getByRole("button", { name: "Zoom in" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Zoom out" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Reset view" })).toBeDefined();
  });

  it("graph container is keyboard focusable with role=application", () => {
    render(
      <GraphRenderer
        graph={mockGraph as never}
        onHoverNode={onHoverNode}
        onClickNode={onClickNode}
        themeColors={themeColors}
        nodeCount={2}
        connectionCount={1}
      />,
    );

    const container = screen.getByRole("application");
    expect(container).toBeDefined();
    expect(container.getAttribute("tabindex")).toBe("0");
  });

  it("arrow key navigates to first node", () => {
    render(
      <GraphRenderer
        graph={mockGraph as never}
        onHoverNode={onHoverNode}
        onClickNode={onClickNode}
        themeColors={themeColors}
        nodeCount={2}
        connectionCount={1}
      />,
    );

    const container = screen.getByRole("application");
    fireEvent.keyDown(container, { key: "ArrowRight" });
    expect(onHoverNode).toHaveBeenCalledWith(
      expect.objectContaining({ id: "node1" }),
    );
  });

  it("Enter key triggers onClickNode", () => {
    render(
      <GraphRenderer
        graph={mockGraph as never}
        onHoverNode={onHoverNode}
        onClickNode={onClickNode}
        themeColors={themeColors}
        nodeCount={2}
        connectionCount={1}
      />,
    );

    const container = screen.getByRole("application");
    // Navigate to first node first
    fireEvent.keyDown(container, { key: "ArrowRight" });
    // Then press Enter to select
    fireEvent.keyDown(container, { key: "Enter" });
    expect(onClickNode).toHaveBeenCalledWith("node1");
  });

  it("Escape key clears hover", () => {
    render(
      <GraphRenderer
        graph={mockGraph as never}
        onHoverNode={onHoverNode}
        onClickNode={onClickNode}
        themeColors={themeColors}
        nodeCount={2}
        connectionCount={1}
      />,
    );

    const container = screen.getByRole("application");
    fireEvent.keyDown(container, { key: "Escape" });
    expect(onHoverNode).toHaveBeenCalledWith(null);
  });
});
