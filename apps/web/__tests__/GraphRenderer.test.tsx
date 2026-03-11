import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// Use vi.hoisted so mock objects are available in vi.mock factories
const { mockSigmaInstance, SigmaMock } = vi.hoisted(() => {
  const mockSigmaInstance = {
    on: vi.fn(),
    kill: vi.fn(),
    getCamera: vi.fn(() => ({
      animatedZoom: vi.fn(),
      animatedUnzoom: vi.fn(),
      animatedReset: vi.fn(),
    })),
    getNodeDisplayData: vi.fn(() => ({ x: 10, y: 20 })),
  };

  const SigmaMock = vi.fn(function () {
    return mockSigmaInstance;
  });

  return { mockSigmaInstance, SigmaMock };
});

vi.mock("sigma", () => ({
  default: SigmaMock,
}));

// Mock @vmem/ui
vi.mock("@vmem/ui", () => ({
  Button: ({
    children,
    onClick,
    "aria-label": ariaLabel,
    ...props
  }: React.PropsWithChildren<{
    onClick?: () => void;
    "aria-label"?: string;
    [key: string]: unknown;
  }>) => (
    <button onClick={onClick} aria-label={ariaLabel} {...props}>
      {children}
    </button>
  ),
}));

// Mock @tabler/icons-react
vi.mock("@tabler/icons-react", () => ({
  IconZoomIn: () => <span>zoom-in</span>,
  IconZoomOut: () => <span>zoom-out</span>,
  IconFocus2: () => <span>focus</span>,
}));

const mockGraph = {
  nodes: vi.fn(() => ["node-1", "node-2"]),
  getNodeAttributes: vi.fn((id: string) => ({
    label: id === "node-1" ? "Memory One" : "Memory Two",
    content: `Content of ${id}`,
    tags: [],
    createdAt: "2024-01-01T00:00:00.000Z",
  })),
};

const defaultProps = {
  graph: mockGraph as never,
  onHoverNode: vi.fn(),
  onClickNode: vi.fn(),
  themeColors: {
    labelColor: "#333",
    edgeColor: "#ccc",
    defaultNodeColor: "#888",
  },
  nodeCount: 2,
  connectionCount: 1,
};

import GraphRenderer from "@/components/_components/GraphRenderer";

describe("GraphRenderer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGraph.nodes.mockReturnValue(["node-1", "node-2"]);
    SigmaMock.mockImplementation(function () {
      return mockSigmaInstance;
    });
  });

  it("renders node count and connection count", () => {
    render(<GraphRenderer {...defaultProps} />);
    expect(screen.getByText("2 memories")).toBeInTheDocument();
    expect(screen.getByText("1 connections")).toBeInTheDocument();
  });

  it("renders accessibility-labeled canvas area", () => {
    render(<GraphRenderer {...defaultProps} />);
    expect(
      screen.getByRole("img", {
        name: /memory graph with 2 memories and 1 connections/i,
      }),
    ).toBeInTheDocument();
  });

  it("renders accessible node list for screen readers", () => {
    render(<GraphRenderer {...defaultProps} />);
    expect(
      screen.getByRole("list", { name: /memory graph nodes/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Memory One/)).toBeInTheDocument();
    expect(screen.getByText(/Memory Two/)).toBeInTheDocument();
  });

  it("renders zoom and reset control buttons", () => {
    render(<GraphRenderer {...defaultProps} />);
    expect(
      screen.getByRole("button", { name: /zoom in/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /zoom out/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /reset camera/i }),
    ).toBeInTheDocument();
  });

  it("shows error state when Sigma initialization throws", () => {
    SigmaMock.mockImplementationOnce(function () {
      throw new Error("WebGL not available");
    });

    render(<GraphRenderer {...defaultProps} />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(
      screen.getByText(/graph rendering unavailable/i),
    ).toBeInTheDocument();
  });
});
