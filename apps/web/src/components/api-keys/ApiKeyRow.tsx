import { TableRow, TableCell, Badge, Button } from "@vmem/ui";
import {
  IconCopy,
  IconCheck,
  IconEye,
  IconEyeOff,
  IconLoader2,
  IconPencil,
  IconBan,
  IconTrash,
} from "@tabler/icons-react";
import { formatRelativeTime } from "@vmem/shared";
import { formatDate, formatNumber } from "@/lib/formatters";
import type { ApiKey } from "./types";

function ApiKeyActiveBadge() {
  return (
    <Badge className="border-success/25 bg-success/12 text-success text-xs">
      Active
    </Badge>
  );
}

function ApiKeyRevokedBadge() {
  return <Badge className="bg-danger/10 text-danger text-xs">Revoked</Badge>;
}

function ApiKeySecretCellRevoked({ maskedKey }: { maskedKey: string }) {
  return (
    <div className="flex items-center gap-2">
      <code className="text-sm text-muted font-mono">{maskedKey}</code>
    </div>
  );
}

function ApiKeySecretCellActive({
  apiKeyId,
  maskedKey,
  revealedKey,
  isRevealing,
  isRevealed,
  isCopying,
  isCopied,
  onToggleReveal,
  onCopy,
}: {
  apiKeyId: ApiKey["id"];
  maskedKey: string;
  revealedKey: string | undefined;
  isRevealing: boolean;
  isRevealed: boolean;
  isCopying: boolean;
  isCopied: boolean;
  onToggleReveal: (id: ApiKey["id"]) => void;
  onCopy: (id: ApiKey["id"]) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <code className="text-sm text-muted font-mono">
        {revealedKey ?? maskedKey}
      </code>
      <Button
        size="icon-sm"
        variant="ghost"
        onClick={() => onToggleReveal(apiKeyId)}
        disabled={isRevealing}
        title={isRevealed ? "Hide key" : "Reveal key"}
      >
        {isRevealing ? (
          <IconLoader2 size={14} className="animate-spin" />
        ) : isRevealed ? (
          <IconEyeOff size={14} />
        ) : (
          <IconEye size={14} />
        )}
      </Button>
      <Button
        size="icon-sm"
        variant="ghost"
        onClick={() => onCopy(apiKeyId)}
        disabled={isCopying}
        title={isCopied ? "Copied!" : "Copy key"}
      >
        {isCopying ? (
          <IconLoader2 size={14} className="animate-spin" />
        ) : isCopied ? (
          <IconCheck size={14} className="text-accent" />
        ) : (
          <IconCopy size={14} />
        )}
      </Button>
    </div>
  );
}

interface ApiKeyRowProps {
  apiKey: ApiKey;
  revealedKey: string | undefined;
  revealingKeyId: ApiKey["id"] | null;
  copyingKeyId: ApiKey["id"] | null;
  copiedKeyId: ApiKey["id"] | null;
  onToggleReveal: (id: ApiKey["id"]) => void;
  onCopy: (id: ApiKey["id"]) => void;
  onEdit: (id: ApiKey["id"]) => void;
  onRevoke: (id: ApiKey["id"]) => void;
  onDelete: (id: ApiKey["id"]) => void;
}

export function ApiKeyRow({
  apiKey,
  revealedKey,
  revealingKeyId,
  copyingKeyId,
  copiedKeyId,
  onToggleReveal,
  onCopy,
  onEdit,
  onRevoke,
  onDelete,
}: ApiKeyRowProps) {
  const isActive = apiKey.status === "active";
  const isRevealing = revealingKeyId === apiKey.id;
  const isCopying = copyingKeyId === apiKey.id;
  const isCopied = copiedKeyId === apiKey.id;
  const isRevealed = revealedKey !== undefined;

  return (
    <TableRow>
      <TableCell className="py-4">
        <span className="text-foreground">{apiKey.name}</span>
        <p className="text-xs text-muted mt-0.5 md:hidden">
          {formatDate(apiKey.createdAt)}
        </p>
      </TableCell>
      <TableCell className="hidden sm:table-cell py-4">
        {isActive ? <ApiKeyActiveBadge /> : <ApiKeyRevokedBadge />}
      </TableCell>
      <TableCell className="hidden md:table-cell py-4">
        {isActive ? (
          <ApiKeySecretCellActive
            apiKeyId={apiKey.id}
            maskedKey={apiKey.maskedKey}
            revealedKey={revealedKey}
            isRevealing={isRevealing}
            isRevealed={isRevealed}
            isCopying={isCopying}
            isCopied={isCopied}
            onToggleReveal={onToggleReveal}
            onCopy={onCopy}
          />
        ) : (
          <ApiKeySecretCellRevoked maskedKey={apiKey.maskedKey} />
        )}
      </TableCell>
      <TableCell className="hidden lg:table-cell py-4">
        <span className="text-sm text-muted tabular-nums">
          {formatNumber(apiKey.requestCount)}
        </span>
      </TableCell>
      <TableCell className="hidden sm:table-cell py-4">
        <span className="text-sm text-muted">
          {formatRelativeTime(apiKey.lastUsedAt)}
        </span>
      </TableCell>
      <TableCell className="py-4 text-right">
        <div className="flex items-center justify-end gap-1">
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => onEdit(apiKey.id)}
            title="Edit name"
          >
            <IconPencil size={14} />
          </Button>
          {isActive ? (
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={() => onRevoke(apiKey.id)}
              title="Revoke key"
              className="text-danger hover:text-danger"
            >
              <IconBan size={14} />
            </Button>
          ) : null}
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => onDelete(apiKey.id)}
            title="Delete key"
            className="text-danger hover:text-danger"
          >
            <IconTrash size={14} />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
