import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock @vmem/ui components
vi.mock("@vmem/ui", () => ({
  TableRow: ({ children }: { children: React.ReactNode }) => (
    <tr>{children}</tr>
  ),
  TableCell: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => <td className={className}>{children}</td>,
  Badge: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
  Button: ({
    children,
    onClick,
    disabled,
    "aria-label": ariaLabel,
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    "aria-label"?: string;
    size?: string;
    variant?: string;
  }) => (
    <button onClick={onClick} disabled={disabled} aria-label={ariaLabel}>
      {children}
    </button>
  ),
}));

// Mock @vmem/backend
vi.mock("@vmem/backend", () => ({
  api: { apiKeys: { listMy: vi.fn() } },
}));

import { ApiKeyRow } from "../ApiKeyRow";

const mockActiveKey = {
  id: "key-1",
  name: "Production Key",
  status: "active" as const,
  createdAt: "2024-01-01T00:00:00Z",
  lastUsedAt: "2024-06-01T00:00:00Z",
  requestCount: 42,
};

const mockRevokedKey = {
  ...mockActiveKey,
  id: "key-2",
  status: "revoked" as const,
};

describe("ApiKeyRow", () => {
  it("renders key name", () => {
    render(
      <table>
        <tbody>
          <ApiKeyRow
            apiKey={mockActiveKey}
            revealedKey={undefined}
            revealingKeyId={null}
            copyingKeyId={null}
            copiedKeyId={null}
            onToggleReveal={vi.fn()}
            onCopy={vi.fn()}
            onRevoke={vi.fn()}
          />
        </tbody>
      </table>,
    );
    expect(screen.getByText("Production Key")).toBeDefined();
  });

  it("shows Revoke button for active keys", () => {
    render(
      <table>
        <tbody>
          <ApiKeyRow
            apiKey={mockActiveKey}
            revealedKey={undefined}
            revealingKeyId={null}
            copyingKeyId={null}
            copiedKeyId={null}
            onToggleReveal={vi.fn()}
            onCopy={vi.fn()}
            onRevoke={vi.fn()}
          />
        </tbody>
      </table>,
    );
    expect(screen.getByText("Revoke")).toBeDefined();
  });

  it("shows Revoked badge for revoked keys", () => {
    render(
      <table>
        <tbody>
          <ApiKeyRow
            apiKey={mockRevokedKey}
            revealedKey={undefined}
            revealingKeyId={null}
            copyingKeyId={null}
            copiedKeyId={null}
            onToggleReveal={vi.fn()}
            onCopy={vi.fn()}
            onRevoke={vi.fn()}
          />
        </tbody>
      </table>,
    );
    expect(screen.getByText("Revoked")).toBeDefined();
  });

  it("reveal button has aria-label", () => {
    render(
      <table>
        <tbody>
          <ApiKeyRow
            apiKey={mockActiveKey}
            revealedKey={undefined}
            revealingKeyId={null}
            copyingKeyId={null}
            copiedKeyId={null}
            onToggleReveal={vi.fn()}
            onCopy={vi.fn()}
            onRevoke={vi.fn()}
          />
        </tbody>
      </table>,
    );
    expect(
      screen.getByRole("button", { name: "Reveal API key" }),
    ).toBeDefined();
    expect(screen.getByRole("button", { name: "Copy API key" })).toBeDefined();
  });

  it("calls onRevoke when Revoke button is clicked", async () => {
    const onRevoke = vi.fn();
    render(
      <table>
        <tbody>
          <ApiKeyRow
            apiKey={mockActiveKey}
            revealedKey={undefined}
            revealingKeyId={null}
            copyingKeyId={null}
            copiedKeyId={null}
            onToggleReveal={vi.fn()}
            onCopy={vi.fn()}
            onRevoke={onRevoke}
          />
        </tbody>
      </table>,
    );
    await userEvent.click(screen.getByText("Revoke"));
    expect(onRevoke).toHaveBeenCalledWith("key-1");
  });
});
