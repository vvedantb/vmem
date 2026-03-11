import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock sigma since it requires a real canvas/WebGL context
let mockSigmaThrow = false;
vi.mock("sigma", () => ({
  default: class MockSigma {
    on = vi.fn();
    kill = vi.fn();
    getCamera = vi.fn().mockReturnValue({
      animatedZoom: vi.fn(),
      animatedUnzoom: vi.fn(),
      animatedReset: vi.fn(),
    });
    getNodeDisplayData = vi.fn();
    constructor() {
      if (mockSigmaThrow) {
        throw new Error("WebGL not supported");
      }
    }
  },
}));

// Mock graphology graph
const mockGraph = {
  getNodeAttributes: vi.fn().mockReturnValue({ label: "test", content: "c" }),
};

// Mock @vmem/ui Button
vi.mock("@vmem/ui", () => ({
  Button: ({
    children,
    onClick,
    "aria-label": ariaLabel,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    "aria-label"?: string;
    size?: string;
    variant?: string;
  }) => (
    <button onClick={onClick} aria-label={ariaLabel} {...props}>
      {children}
    </button>
  ),
}));

import GraphRenderer from "../GraphRenderer";
import type { GraphThemeColors } from "../graph-types";

const mockTheme: GraphThemeColors = {
  defaultNodeColor: "#000",
  edgeColor: "#ccc",
  labelColor: "#333",
  hoveredNodeColor: "#f00",
  selectedNodeColor: "#0f0",
};

describe("GraphRenderer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders node and connection counts", () => {
    render(
      <GraphRenderer
        graph={mockGraph as never}
        onHoverNode={vi.fn()}
        onClickNode={vi.fn()}
        themeColors={mockTheme}
        nodeCount={10}
        connectionCount={5}
      />,
    );
    expect(screen.getByText("10 memories")).toBeDefined();
    expect(screen.getByText("5 connections")).toBeDefined();
  });

  it("renders zoom buttons with aria-labels", () => {
    render(
      <GraphRenderer
        graph={mockGraph as never}
        onHoverNode={vi.fn()}
        onClickNode={vi.fn()}
        themeColors={mockTheme}
        nodeCount={0}
        connectionCount={0}
      />,
    );
    expect(screen.getByRole("button", { name: "Zoom in" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Zoom out" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Reset camera" })).toBeDefined();
  });

  it("shows error message when Sigma initialization fails", () => {
    mockSigmaThrow = true;
    render(
      <GraphRenderer
        graph={mockGraph as never}
        onHoverNode={vi.fn()}
        onClickNode={vi.fn()}
        themeColors={mockTheme}
        nodeCount={0}
        connectionCount={0}
      />,
    );
    mockSigmaThrow = false;
    expect(screen.getByText(/Failed to load graph/)).toBeDefined();
  });
});
