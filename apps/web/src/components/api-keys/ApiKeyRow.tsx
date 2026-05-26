"use client";

import type { FunctionReturnType } from "convex/server";
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
import { api } from "@vmem/backend";
import { formatRelativeTime, formatDate, formatNumber } from "@/lib/formatters";

type ApiKey = FunctionReturnType<typeof api.apiKeys.listMy>[number];

interface ApiKeyRowProps {
  apiKey: ApiKey;
  revealedKey: string | undefined;
  revealingKeyId: string | null;
  copyingKeyId: string | null;
  copiedKeyId: string | null;
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

  return (
    <TableRow>
      <TableCell className="py-4">
        <span className="text-foreground">{apiKey.name}</span>
        <p className="text-xs text-muted mt-0.5 md:hidden">
          {formatDate(apiKey.createdAt)}
        </p>
      </TableCell>
      <TableCell className="hidden sm:table-cell py-4">
        {isActive ? (
          <Badge className="border-success/25 bg-success/12 text-success text-xs">
            Active
          </Badge>
        ) : (
          <Badge className="bg-danger/10 text-danger text-xs">Revoked</Badge>
        )}
      </TableCell>
      <TableCell className="hidden md:table-cell py-4">
        <div className="flex items-center gap-2">
          <code className="text-sm text-muted font-mono">
            {revealedKey ?? "vmem_sk_••••••••••••••••"}
          </code>
          {isActive && (
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={() => onToggleReveal(apiKey.id)}
              disabled={revealingKeyId === apiKey.id}
              title={revealedKey ? "Hide key" : "Reveal key"}
            >
              {revealingKeyId === apiKey.id ? (
                <IconLoader2 size={14} className="animate-spin" />
              ) : revealedKey ? (
                <IconEyeOff size={14} />
              ) : (
                <IconEye size={14} />
              )}
            </Button>
          )}
          {isActive && (
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={() => onCopy(apiKey.id)}
              disabled={copyingKeyId === apiKey.id}
              title={copiedKeyId === apiKey.id ? "Copied!" : "Copy key"}
            >
              {copyingKeyId === apiKey.id ? (
                <IconLoader2 size={14} className="animate-spin" />
              ) : copiedKeyId === apiKey.id ? (
                <IconCheck size={14} className="text-accent" />
              ) : (
                <IconCopy size={14} />
              )}
            </Button>
          )}
        </div>
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
