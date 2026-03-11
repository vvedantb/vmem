import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ApiKeyRow } from "./ApiKeyRow";

// Mock UI components from @vmem/ui with simple HTML equivalents
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
  Badge: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => <span className={className}>{children}</span>,
  Button: ({
    children,
    onClick,
    disabled,
    "aria-label": ariaLabel,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    "aria-label"?: string;
  }) => (
    <button onClick={onClick} disabled={disabled} aria-label={ariaLabel}>
      {children}
    </button>
  ),
}));

vi.mock("@vmem/backend", () => ({ api: {} }));

vi.mock("@/lib/formatters", () => ({
  formatRelativeTime: () => "2 hours ago",
  formatDate: () => "Jan 1, 2024",
  formatNumber: (n: number) => String(n),
}));

const baseKey = {
  id: "key_1" as never,
  name: "Test Key",
  maskedKey: "vmem_sk_abc1••••••••••••••••5678",
  status: "active" as const,
  createdAt: new Date().toISOString(),
  lastUsedAt: new Date().toISOString(),
  requestCount: 42,
};

describe("ApiKeyRow", () => {
  it("renders the key name", () => {
    render(
      <table>
        <tbody>
          <ApiKeyRow
            apiKey={baseKey}
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

    expect(screen.getByText("Test Key")).toBeInTheDocument();
  });

  it("reveal button has aria-label when key is hidden", () => {
    render(
      <table>
        <tbody>
          <ApiKeyRow
            apiKey={baseKey}
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
    ).toBeInTheDocument();
  });

  it("reveal button shows 'Hide API key' label when key is revealed", () => {
    render(
      <table>
        <tbody>
          <ApiKeyRow
            apiKey={baseKey}
            revealedKey="vmem_sk_abc123"
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
      screen.getByRole("button", { name: "Hide API key" }),
    ).toBeInTheDocument();
  });

  it("copy button has aria-label", () => {
    render(
      <table>
        <tbody>
          <ApiKeyRow
            apiKey={baseKey}
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
      screen.getByRole("button", { name: "Copy API key" }),
    ).toBeInTheDocument();
  });

  it("calls onToggleReveal when reveal button clicked", () => {
    const onToggleReveal = vi.fn();
    render(
      <table>
        <tbody>
          <ApiKeyRow
            apiKey={baseKey}
            revealedKey={undefined}
            revealingKeyId={null}
            copyingKeyId={null}
            copiedKeyId={null}
            onToggleReveal={onToggleReveal}
            onCopy={vi.fn()}
            onRevoke={vi.fn()}
          />
        </tbody>
      </table>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Reveal API key" }));
    expect(onToggleReveal).toHaveBeenCalledWith("key_1");
  });

  it("calls onCopy when copy button clicked", () => {
    const onCopy = vi.fn();
    render(
      <table>
        <tbody>
          <ApiKeyRow
            apiKey={baseKey}
            revealedKey={undefined}
            revealingKeyId={null}
            copyingKeyId={null}
            copiedKeyId={null}
            onToggleReveal={vi.fn()}
            onCopy={onCopy}
            onRevoke={vi.fn()}
          />
        </tbody>
      </table>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Copy API key" }));
    expect(onCopy).toHaveBeenCalledWith("key_1");
  });

  it("does not show reveal/copy buttons for revoked keys", () => {
    render(
      <table>
        <tbody>
          <ApiKeyRow
            apiKey={{ ...baseKey, status: "revoked" }}
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
      screen.queryByRole("button", { name: "Reveal API key" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Copy API key" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Revoked")).toBeInTheDocument();
  });
});
