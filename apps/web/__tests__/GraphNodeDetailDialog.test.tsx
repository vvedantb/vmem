import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock @vmem/ui
vi.mock("@vmem/ui", () => ({
  Badge: ({
    children,
    ...props
  }: React.PropsWithChildren<Record<string, unknown>>) => (
    <span data-testid="badge" {...props}>
      {children}
    </span>
  ),
  Button: ({
    children,
    onClick,
    ...props
  }: React.PropsWithChildren<{
    onClick?: () => void;
    [key: string]: unknown;
  }>) => (
    <button onClick={onClick} {...props}>
      {children}
    </button>
  ),
  Dialog: ({ children, open }: React.PropsWithChildren<{ open?: boolean }>) =>
    open ? <div role="dialog">{children}</div> : null,
  DialogContent: ({ children }: React.PropsWithChildren) => (
    <div>{children}</div>
  ),
  DialogHeader: ({ children }: React.PropsWithChildren) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: React.PropsWithChildren) => <h2>{children}</h2>,
}));

// Mock graphology
const mockGraph = {
  hasNode: vi.fn((id: string) => id === "node-1"),
  getNodeAttributes: vi.fn((id: string) =>
    id === "node-1"
      ? {
          label: "Test Memory",
          content: "This is test content",
          tags: ["react", "testing"],
          createdAt: "2024-01-15T10:00:00.000Z",
        }
      : {
          label: "Neighbor Memory",
          content: "Neighbor content",
          tags: [],
          createdAt: "2024-01-15T10:00:00.000Z",
        },
  ),
  neighbors: vi.fn(() => ["node-2"]),
  edge: vi.fn(() => "edge-1"),
  getEdgeAttribute: vi.fn(() => 2),
};

import GraphNodeDetailDialog from "@/components/_components/GraphNodeDetailDialog";

describe("GraphNodeDetailDialog", () => {
  it("returns null when nodeId is null", () => {
    const { container } = render(
      <GraphNodeDetailDialog
        nodeId={null}
        graph={mockGraph as never}
        onClose={vi.fn()}
        onNavigate={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("returns null when graph is null", () => {
    const { container } = render(
      <GraphNodeDetailDialog
        nodeId="node-1"
        graph={null}
        onClose={vi.fn()}
        onNavigate={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders node details when nodeId and graph are valid", () => {
    render(
      <GraphNodeDetailDialog
        nodeId="node-1"
        graph={mockGraph as never}
        onClose={vi.fn()}
        onNavigate={vi.fn()}
      />,
    );
    expect(screen.getByText("Test Memory")).toBeInTheDocument();
    expect(screen.getByText("This is test content")).toBeInTheDocument();
  });

  it("renders tags as badges", () => {
    render(
      <GraphNodeDetailDialog
        nodeId="node-1"
        graph={mockGraph as never}
        onClose={vi.fn()}
        onNavigate={vi.fn()}
      />,
    );
    expect(screen.getByText("react")).toBeInTheDocument();
    expect(screen.getByText("testing")).toBeInTheDocument();
  });

  it("calls onNavigate when neighbor button is clicked", async () => {
    const onNavigate = vi.fn();
    render(
      <GraphNodeDetailDialog
        nodeId="node-1"
        graph={mockGraph as never}
        onClose={vi.fn()}
        onNavigate={onNavigate}
      />,
    );

    const neighborButton = screen
      .getByText("Neighbor Memory")
      .closest("button");
    if (neighborButton) {
      await userEvent.click(neighborButton);
      expect(onNavigate).toHaveBeenCalledWith("node-2");
    }
  });
});
