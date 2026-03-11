import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock @vmem/ui components
vi.mock("@vmem/ui", () => ({
  Button: ({
    children,
    onClick,
    disabled,
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
  Dialog: ({
    children,
    open,
  }: {
    children: React.ReactNode;
    open: boolean;
    onOpenChange?: (open: boolean) => void;
  }) => (open ? <div>{children}</div> : null),
  DialogContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children: React.ReactNode }) => (
    <h2>{children}</h2>
  ),
  DialogDescription: ({ children }: { children: React.ReactNode }) => (
    <p>{children}</p>
  ),
  DialogFooter: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

import { RevokeKeyDialog } from "../RevokeKeyDialog";

describe("RevokeKeyDialog", () => {
  it("does not render when closed", () => {
    const { container } = render(
      <RevokeKeyDialog
        keyName="My Key"
        isOpen={false}
        isRevoking={false}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(container.textContent).toBe("");
  });

  it("renders key name when open", () => {
    render(
      <RevokeKeyDialog
        keyName="Production Key"
        isOpen={true}
        isRevoking={false}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText("Production Key")).toBeDefined();
  });

  it("calls onConfirm when Revoke Key is clicked", async () => {
    const onConfirm = vi.fn();
    render(
      <RevokeKeyDialog
        keyName="My Key"
        isOpen={true}
        isRevoking={false}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByText("Revoke Key"));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("calls onCancel when Cancel is clicked", async () => {
    const onCancel = vi.fn();
    render(
      <RevokeKeyDialog
        keyName="My Key"
        isOpen={true}
        isRevoking={false}
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );
    await userEvent.click(screen.getByText("Cancel"));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("disables buttons while revoking", () => {
    render(
      <RevokeKeyDialog
        keyName="My Key"
        isOpen={true}
        isRevoking={true}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const buttons = screen.getAllByRole("button");
    buttons.forEach((btn) => expect(btn).toBeDisabled());
  });
});
