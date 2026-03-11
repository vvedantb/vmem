import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RevokeKeyDialog } from "../../components/api-keys/RevokeKeyDialog";

// Mock @vmem/ui to use simple HTML elements
vi.mock("@vmem/ui", () => ({
  Button: ({
    children,
    onClick,
    disabled,
    ...props
  }: React.PropsWithChildren<{
    onClick?: () => void;
    disabled?: boolean;
    className?: string;
    variant?: string;
  }>) => (
    <button onClick={onClick} disabled={disabled} {...props}>
      {children}
    </button>
  ),
  Dialog: ({
    open,
    children,
  }: {
    open: boolean;
    children: React.ReactNode;
    onOpenChange?: (open: boolean) => void;
  }) => (open ? <div role="dialog">{children}</div> : null),
  DialogContent: ({ children }: React.PropsWithChildren) => (
    <div>{children}</div>
  ),
  DialogHeader: ({ children }: React.PropsWithChildren) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: React.PropsWithChildren) => <h2>{children}</h2>,
  DialogDescription: ({
    children,
    className,
  }: React.PropsWithChildren<{ className?: string }>) => (
    <p className={className}>{children}</p>
  ),
  DialogFooter: ({ children }: React.PropsWithChildren) => (
    <div>{children}</div>
  ),
}));

vi.mock("@tabler/icons-react", () => ({
  IconAlertTriangle: () => <span data-testid="alert-icon" />,
  IconLoader2: () => <span data-testid="loader-icon" />,
}));

describe("RevokeKeyDialog", () => {
  it("renders nothing when not open", () => {
    render(
      <RevokeKeyDialog
        keyName="my-key"
        isOpen={false}
        isRevoking={false}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders dialog when open", () => {
    render(
      <RevokeKeyDialog
        keyName="my-key"
        isOpen
        isRevoking={false}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByRole("dialog")).toBeDefined();
    expect(screen.getByText("Revoke API Key")).toBeDefined();
    expect(screen.getByText("my-key")).toBeDefined();
  });

  it("calls onConfirm when Revoke Key button is clicked", () => {
    const onConfirm = vi.fn();
    render(
      <RevokeKeyDialog
        keyName="my-key"
        isOpen
        isRevoking={false}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("Revoke Key"));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("calls onCancel when Cancel button is clicked", () => {
    const onCancel = vi.fn();
    render(
      <RevokeKeyDialog
        keyName="my-key"
        isOpen
        isRevoking={false}
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByText("Cancel"));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("disables buttons while revoking", () => {
    render(
      <RevokeKeyDialog
        keyName="my-key"
        isOpen
        isRevoking
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const buttons = screen.getAllByRole("button");
    buttons.forEach((btn) => {
      expect(btn).toBeDisabled();
    });
  });

  it("shows loading text while revoking", () => {
    render(
      <RevokeKeyDialog
        keyName="my-key"
        isOpen
        isRevoking
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText("Revoking...")).toBeDefined();
  });

  it("has sr-only description for accessibility", () => {
    render(
      <RevokeKeyDialog
        keyName="my-key"
        isOpen
        isRevoking={false}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const desc = document.querySelector(".sr-only");
    expect(desc).not.toBeNull();
    expect(desc!.textContent).toContain("Confirm revoking an API key");
  });
});
