import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import GraphRenderer from "./GraphRenderer";
import Graph from "graphology";
import type {
  NodeAttributes,
  EdgeAttributes,
  GraphThemeColors,
} from "./graph-types";

// Mock Sigma (WebGL canvas renderer — not available in jsdom)
vi.mock("sigma", () => ({
  default: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    off: vi.fn(),
    kill: vi.fn(),
    getCamera: vi.fn().mockReturnValue({
      animatedZoom: vi.fn(),
      animatedUnzoom: vi.fn(),
      animatedReset: vi.fn(),
    }),
    refresh: vi.fn(),
    getNodeDisplayData: vi.fn().mockReturnValue({ x: 100, y: 100 }),
  })),
}));

vi.mock("@vmem/ui", () => ({
  Button: ({
    children,
    onClick,
    className,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    className?: string;
  }) => (
    <button onClick={onClick} className={className}>
      {children}
    </button>
  ),
}));

const themeColors: GraphThemeColors = {
  labelColor: "#000",
  edgeColor: "#ccc",
  defaultNodeColor: "#888",
};

function makeGraph() {
  const g = new Graph<NodeAttributes, EdgeAttributes>();
  g.addNode("n1", {
    x: 0,
    y: 0,
    size: 10,
    label: "Memory 1",
    color: "#888",
    content: "Content",
    tags: [],
    createdAt: "2024-01-01T00:00:00Z",
  });
  return g;
}

describe("GraphRenderer", () => {
  it("renders node and connection count stats", () => {
    const graph = makeGraph();

    render(
      <GraphRenderer
        graph={graph}
        onHoverNode={vi.fn()}
        onClickNode={vi.fn()}
        themeColors={themeColors}
        nodeCount={5}
        connectionCount={3}
      />,
    );

    expect(screen.getByText("5 memories")).toBeInTheDocument();
    expect(screen.getByText("3 connections")).toBeInTheDocument();
  });

  it("renders three camera control buttons", () => {
    const graph = makeGraph();

    render(
      <GraphRenderer
        graph={graph}
        onHoverNode={vi.fn()}
        onClickNode={vi.fn()}
        themeColors={themeColors}
        nodeCount={1}
        connectionCount={0}
      />,
    );

    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(3);
  });

  it("renders usage hint text", () => {
    const graph = makeGraph();

    render(
      <GraphRenderer
        graph={graph}
        onHoverNode={vi.fn()}
        onClickNode={vi.fn()}
        themeColors={themeColors}
        nodeCount={1}
        connectionCount={0}
      />,
    );

    expect(screen.getByText(/click node to view details/i)).toBeInTheDocument();
  });
});
