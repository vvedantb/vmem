import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ApiKeyRow } from "../../components/api-keys/ApiKeyRow";

vi.mock("@vmem/ui", () => ({
  TableRow: ({ children }: React.PropsWithChildren) => <tr>{children}</tr>,
  TableCell: ({
    children,
    className,
  }: React.PropsWithChildren<{ className?: string }>) => (
    <td className={className}>{children}</td>
  ),
  Badge: ({
    children,
    className,
  }: React.PropsWithChildren<{ className?: string; variant?: string }>) => (
    <span className={className}>{children}</span>
  ),
  Button: ({
    children,
    onClick,
    disabled,
    ...props
  }: React.PropsWithChildren<{
    onClick?: () => void;
    disabled?: boolean;
    size?: string;
    variant?: string;
    className?: string;
  }>) => (
    <button onClick={onClick} disabled={disabled} {...props}>
      {children}
    </button>
  ),
}));

vi.mock("@tabler/icons-react", () => ({
  IconLoader2: () => <span data-testid="loader" />,
  IconCopy: () => <span data-testid="copy" />,
  IconCheck: () => <span data-testid="check" />,
  IconEye: () => <span data-testid="eye" />,
  IconEyeOff: () => <span data-testid="eye-off" />,
}));

vi.mock("@vmem/backend", () => ({ api: { apiKeys: { listMy: "listMy" } } }));

vi.mock("../../lib/formatters", () => ({
  formatRelativeTime: (d: string | null) => (d ? "2 days ago" : "Never"),
  formatDate: () => "Jan 1, 2024",
  formatNumber: (n: number) => String(n),
}));

const activeKey = {
  id: "key-1",
  name: "My Key",
  status: "active" as const,
  requestCount: 42,
  lastUsedAt: "2024-01-01T00:00:00Z",
  createdAt: "2024-01-01T00:00:00Z",
};

const revokedKey = {
  ...activeKey,
  status: "revoked" as const,
};

describe("ApiKeyRow - active key", () => {
  it("renders key name", () => {
    render(
      <table>
        <tbody>
          <ApiKeyRow
            apiKey={activeKey}
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
    expect(screen.getByText("My Key")).toBeDefined();
  });

  it("shows masked key when not revealed", () => {
    render(
      <table>
        <tbody>
          <ApiKeyRow
            apiKey={activeKey}
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
    expect(screen.getByText("vmem_sk_••••••••••••••••")).toBeDefined();
  });

  it("shows revealed key value when provided", () => {
    render(
      <table>
        <tbody>
          <ApiKeyRow
            apiKey={activeKey}
            revealedKey="vmem_sk_actual_key_value"
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
    expect(screen.getByText("vmem_sk_actual_key_value")).toBeDefined();
  });

  it("calls onRevoke when Revoke button is clicked", () => {
    const onRevoke = vi.fn();
    render(
      <table>
        <tbody>
          <ApiKeyRow
            apiKey={activeKey}
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
    fireEvent.click(screen.getByText("Revoke"));
    expect(onRevoke).toHaveBeenCalledWith("key-1");
  });
});

describe("ApiKeyRow - revoked key", () => {
  it("shows Revoked badge", () => {
    render(
      <table>
        <tbody>
          <ApiKeyRow
            apiKey={revokedKey}
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

  it("does not show Revoke button for revoked key", () => {
    render(
      <table>
        <tbody>
          <ApiKeyRow
            apiKey={revokedKey}
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
    expect(screen.queryByText("Revoke")).toBeNull();
  });
});
