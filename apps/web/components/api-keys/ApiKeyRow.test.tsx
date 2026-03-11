import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// Mock heavy external dependencies
vi.mock("convex/server", () => ({}));
vi.mock("@vmem/backend", () => ({ api: { apiKeys: { listMy: vi.fn() } } }));
vi.mock("@vmem/ui", () => ({
  TableRow: ({ children }: { children: React.ReactNode }) => (
    <tr>{children}</tr>
  ),
  TableCell: ({ children }: { children: React.ReactNode }) => (
    <td>{children}</td>
  ),
  Badge: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));
vi.mock("@tabler/icons-react", () => ({
  IconLoader2: () => <span>Loading</span>,
  IconCopy: () => <span>Copy</span>,
  IconCheck: () => <span>Check</span>,
  IconEye: () => <span>Show</span>,
  IconEyeOff: () => <span>Hide</span>,
}));
vi.mock("@/lib/formatters", () => ({
  formatRelativeTime: () => "2 days ago",
  formatDate: () => "Jan 1, 2024",
  formatNumber: (n: number) => String(n),
}));

import { ApiKeyRow } from "./ApiKeyRow";

type MockApiKey = {
  id: string;
  name: string;
  status: "active" | "revoked";
  createdAt: number;
  lastUsedAt: number | null;
  requestCount: number;
};

const activeKey: MockApiKey = {
  id: "key1",
  name: "My API Key",
  status: "active",
  createdAt: Date.now(),
  lastUsedAt: Date.now(),
  requestCount: 42,
};

const revokedKey: MockApiKey = {
  ...activeKey,
  id: "key2",
  status: "revoked",
};

describe("ApiKeyRow", () => {
  const onToggleReveal = vi.fn();
  const onCopy = vi.fn();
  const onRevoke = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders key name", () => {
    render(
      <table>
        <tbody>
          <ApiKeyRow
            apiKey={activeKey as never}
            revealedKey={undefined}
            revealingKeyId={null}
            copyingKeyId={null}
            copiedKeyId={null}
            onToggleReveal={onToggleReveal}
            onCopy={onCopy}
            onRevoke={onRevoke}
          />
        </tbody>
      </table>,
    );
    expect(screen.getByText("My API Key")).toBeDefined();
  });

  it("shows Revoked badge for revoked keys", () => {
    render(
      <table>
        <tbody>
          <ApiKeyRow
            apiKey={revokedKey as never}
            revealedKey={undefined}
            revealingKeyId={null}
            copyingKeyId={null}
            copiedKeyId={null}
            onToggleReveal={onToggleReveal}
            onCopy={onCopy}
            onRevoke={onRevoke}
          />
        </tbody>
      </table>,
    );
    expect(screen.getByText("Revoked")).toBeDefined();
  });

  it("calls onRevoke when Revoke button is clicked", () => {
    render(
      <table>
        <tbody>
          <ApiKeyRow
            apiKey={activeKey as never}
            revealedKey={undefined}
            revealingKeyId={null}
            copyingKeyId={null}
            copiedKeyId={null}
            onToggleReveal={onToggleReveal}
            onCopy={onCopy}
            onRevoke={onRevoke}
          />
        </tbody>
      </table>,
    );
    fireEvent.click(screen.getByText("Revoke"));
    expect(onRevoke).toHaveBeenCalledWith("key1");
  });

  it("does not show Revoke button for revoked keys", () => {
    render(
      <table>
        <tbody>
          <ApiKeyRow
            apiKey={revokedKey as never}
            revealedKey={undefined}
            revealingKeyId={null}
            copyingKeyId={null}
            copiedKeyId={null}
            onToggleReveal={onToggleReveal}
            onCopy={onCopy}
            onRevoke={onRevoke}
          />
        </tbody>
      </table>,
    );
    expect(screen.queryByText("Revoke")).toBeNull();
  });

  it("shows revealed key when provided", () => {
    render(
      <table>
        <tbody>
          <ApiKeyRow
            apiKey={activeKey as never}
            revealedKey="vmem_sk_abc123"
            revealingKeyId={null}
            copyingKeyId={null}
            copiedKeyId={null}
            onToggleReveal={onToggleReveal}
            onCopy={onCopy}
            onRevoke={onRevoke}
          />
        </tbody>
      </table>,
    );
    expect(screen.getByText("vmem_sk_abc123")).toBeDefined();
  });
});
