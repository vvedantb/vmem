import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import GraphNodeDetailDialog from "../../components/_components/GraphNodeDetailDialog";

vi.mock("@vmem/ui", () => ({
  Badge: ({
    children,
    className,
  }: React.PropsWithChildren<{ className?: string; variant?: string }>) => (
    <span className={className}>{children}</span>
  ),
  Button: ({
    children,
    onClick,
    ...props
  }: React.PropsWithChildren<{
    onClick?: () => void;
    className?: string;
    type?: string;
    variant?: string;
    size?: string;
  }>) => (
    <button onClick={onClick} {...props}>
      {children}
    </button>
  ),
  Dialog: ({
    open,
    children,
    onOpenChange,
  }: {
    open: boolean;
    children: React.ReactNode;
    onOpenChange?: (open: boolean) => void;
  }) =>
    open ? (
      <div
        role="dialog"
        onKeyDown={(e) => {
          if (e.key === "Escape" && onOpenChange) onOpenChange(false);
        }}
      >
        {children}
      </div>
    ) : null,
  DialogContent: ({ children }: React.PropsWithChildren) => (
    <div>{children}</div>
  ),
  DialogHeader: ({
    children,
  }: React.PropsWithChildren<{ className?: string }>) => <div>{children}</div>,
  DialogTitle: ({
    children,
    className,
  }: React.PropsWithChildren<{ className?: string }>) => (
    <h2 className={className}>{children}</h2>
  ),
  DialogDescription: ({
    children,
    className,
  }: React.PropsWithChildren<{ className?: string }>) => (
    <p className={className}>{children}</p>
  ),
}));

const mockNodeAttrs = {
  label: "Test Memory",
  content: "This is test content",
  tags: ["tag1", "tag2"],
  createdAt: "2024-01-15T00:00:00Z",
};

function makeGraph(
  nodeId: string,
  attrs = mockNodeAttrs,
  neighbors: string[] = [],
) {
  return {
    hasNode: (id: string) => id === nodeId,
    getNodeAttributes: (id: string) => {
      if (id === nodeId) return attrs;
      return {
        label: `Neighbor ${id}`,
        content: "Neighbor content",
        tags: [],
        createdAt: "2024-01-01T00:00:00Z",
      };
    },
    neighbors: () => neighbors,
    edge: () => null,
    getEdgeAttribute: () => 1,
  };
}

describe("GraphNodeDetailDialog", () => {
  it("renders nothing when nodeId is null", () => {
    render(
      <GraphNodeDetailDialog
        nodeId={null}
        graph={makeGraph("node-1") as never}
        onClose={vi.fn()}
        onNavigate={vi.fn()}
      />,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders nothing when graph is null", () => {
    render(
      <GraphNodeDetailDialog
        nodeId="node-1"
        graph={null}
        onClose={vi.fn()}
        onNavigate={vi.fn()}
      />,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders dialog with node details", () => {
    render(
      <GraphNodeDetailDialog
        nodeId="node-1"
        graph={makeGraph("node-1") as never}
        onClose={vi.fn()}
        onNavigate={vi.fn()}
      />,
    );
    expect(screen.getByRole("dialog")).toBeDefined();
    expect(screen.getByText("Test Memory")).toBeDefined();
    expect(screen.getByText("This is test content")).toBeDefined();
    expect(screen.getByText("tag1")).toBeDefined();
    expect(screen.getByText("tag2")).toBeDefined();
  });

  it("shows sr-only description for screen readers", () => {
    render(
      <GraphNodeDetailDialog
        nodeId="node-1"
        graph={makeGraph("node-1") as never}
        onClose={vi.fn()}
        onNavigate={vi.fn()}
      />,
    );
    const desc = document.querySelector(".sr-only");
    expect(desc).not.toBeNull();
    expect(desc!.textContent).toBeTruthy();
  });

  it("shows no related memories message when no neighbors", () => {
    render(
      <GraphNodeDetailDialog
        nodeId="node-1"
        graph={makeGraph("node-1", mockNodeAttrs, []) as never}
        onClose={vi.fn()}
        onNavigate={vi.fn()}
      />,
    );
    expect(screen.getByText("No related memories found")).toBeDefined();
  });

  it("shows neighbor nodes and calls onNavigate when clicked", () => {
    const onNavigate = vi.fn();
    render(
      <GraphNodeDetailDialog
        nodeId="node-1"
        graph={makeGraph("node-1", mockNodeAttrs, ["node-2"]) as never}
        onClose={vi.fn()}
        onNavigate={onNavigate}
      />,
    );
    const neighborBtn = screen.getByText("Neighbor node-2");
    fireEvent.click(neighborBtn);
    expect(onNavigate).toHaveBeenCalledWith("node-2");
  });
});
