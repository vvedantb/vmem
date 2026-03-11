import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import MemoryDetailPanel from "./MemoryDetailPanel";
import type { Memory } from "@/lib/memories";

// Mock external dependencies
vi.mock("@vmem/ui", () => ({
  Card: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => <div className={className}>{children}</div>,
  Button: ({
    children,
    onClick,
    disabled,
    type,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    type?: "button" | "submit";
  }) => (
    <button onClick={onClick} disabled={disabled} type={type}>
      {children}
    </button>
  ),
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input {...props} />
  ),
  Textarea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
    <textarea {...props} />
  ),
  Badge: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
  Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <div>{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children: React.ReactNode }) => (
    <h2>{children}</h2>
  ),
  DialogFooter: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/components/contexts/MemoryContext", () => ({
  useMemoryContext: () => ({
    memories: [],
    updateMemory: vi.fn(),
    deleteMemory: vi.fn(),
  }),
}));

vi.mock("@hookform/resolvers/zod", () => ({
  zodResolver: () => () => ({}),
}));

vi.mock("@/lib/schemas", () => ({
  memorySchema: {},
}));

const testMemory: Memory = {
  id: "mem1",
  title: "Test Memory Title",
  content: "This is the content of the memory.",
  tags: ["react", "testing"],
  createdAt: "2024-01-15T10:00:00Z",
};

describe("MemoryDetailPanel", () => {
  it("renders the memory title", () => {
    render(
      <MemoryDetailPanel
        memory={testMemory}
        onClose={vi.fn()}
        onMemoryUpdate={vi.fn()}
        onMemoryDelete={vi.fn()}
        relatedMemories={[]}
        onSelectRelated={vi.fn()}
      />,
    );

    expect(screen.getByText("Test Memory Title")).toBeInTheDocument();
  });

  it("renders the memory content", () => {
    render(
      <MemoryDetailPanel
        memory={testMemory}
        onClose={vi.fn()}
        onMemoryUpdate={vi.fn()}
        onMemoryDelete={vi.fn()}
        relatedMemories={[]}
        onSelectRelated={vi.fn()}
      />,
    );

    expect(
      screen.getByText("This is the content of the memory."),
    ).toBeInTheDocument();
  });

  it("renders tags", () => {
    render(
      <MemoryDetailPanel
        memory={testMemory}
        onClose={vi.fn()}
        onMemoryUpdate={vi.fn()}
        onMemoryDelete={vi.fn()}
        relatedMemories={[]}
        onSelectRelated={vi.fn()}
      />,
    );

    expect(screen.getByText("react")).toBeInTheDocument();
    expect(screen.getByText("testing")).toBeInTheDocument();
  });

  it("shows Edit and Delete buttons in view mode", () => {
    render(
      <MemoryDetailPanel
        memory={testMemory}
        onClose={vi.fn()}
        onMemoryUpdate={vi.fn()}
        onMemoryDelete={vi.fn()}
        relatedMemories={[]}
        onSelectRelated={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: /edit/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /delete/i })).toBeInTheDocument();
  });

  it("shows related memories when provided", () => {
    const related: Memory = {
      id: "mem2",
      title: "Related Memory",
      content: "Related content",
      tags: ["react"],
      createdAt: "2024-01-16T00:00:00Z",
    };

    render(
      <MemoryDetailPanel
        memory={testMemory}
        onClose={vi.fn()}
        onMemoryUpdate={vi.fn()}
        onMemoryDelete={vi.fn()}
        relatedMemories={[related]}
        onSelectRelated={vi.fn()}
      />,
    );

    expect(screen.getByText("Related Memory")).toBeInTheDocument();
  });

  it("shows 'No tags' when memory has no tags", () => {
    render(
      <MemoryDetailPanel
        memory={{ ...testMemory, tags: [] }}
        onClose={vi.fn()}
        onMemoryUpdate={vi.fn()}
        onMemoryDelete={vi.fn()}
        relatedMemories={[]}
        onSelectRelated={vi.fn()}
      />,
    );

    expect(screen.getByText("No tags")).toBeInTheDocument();
  });
});
