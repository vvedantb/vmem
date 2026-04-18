"use client";

import type { FunctionReturnType } from "convex/server";
import { TableRow, TableCell, Badge, Button } from "@vmem/ui";
import {
  IconLoader2,
  IconCopy,
  IconCheck,
  IconEye,
  IconEyeOff,
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
  onRevoke: (id: ApiKey["id"]) => void;
}

export function ApiKeyRow({
  apiKey,
  revealedKey,
  revealingKeyId,
  copyingKeyId,
  copiedKeyId,
  onToggleReveal,
  onCopy,
  onRevoke,
}: ApiKeyRowProps) {
  const isActive = apiKey.status === "active";

  return (
    <TableRow>
      <TableCell className="py-4">
        <div className="flex items-center gap-2">
          <span className="text-foreground">{apiKey.name}</span>
          {apiKey.status === "revoked" && (
            <Badge className="bg-destructive/10 text-destructive text-xs">
              Revoked
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 md:hidden">
          {formatDate(apiKey.createdAt)}
        </p>
      </TableCell>
      <TableCell className="hidden md:table-cell py-4">
        <div className="flex items-center gap-2">
          <code className="text-sm text-muted-foreground font-mono">
            {revealedKey ?? "vmem_sk_••••••••••••••••"}
          </code>
          {isActive && (
            <Button
              size="icon-xs"
              variant="ghost"
              onClick={() => onToggleReveal(apiKey.id)}
              disabled={revealingKeyId === apiKey.id}
              className="text-muted-foreground hover:text-foreground"
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
              size="icon-xs"
              variant="ghost"
              onClick={() => onCopy(apiKey.id)}
              disabled={copyingKeyId === apiKey.id}
              className="text-muted-foreground hover:text-foreground"
            >
              {copyingKeyId === apiKey.id ? (
                <IconLoader2 size={14} className="animate-spin" />
              ) : copiedKeyId === apiKey.id ? (
                <IconCheck size={14} />
              ) : (
                <IconCopy size={14} />
              )}
            </Button>
          )}
        </div>
      </TableCell>
      <TableCell className="hidden lg:table-cell py-4">
        <span className="text-sm text-muted-foreground tabular-nums">
          {formatNumber(apiKey.requestCount)}
        </span>
      </TableCell>
      <TableCell className="hidden sm:table-cell py-4">
        <span className="text-sm text-muted-foreground">
          {formatRelativeTime(apiKey.lastUsedAt)}
        </span>
      </TableCell>
      <TableCell className="py-4">
        {isActive ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onRevoke(apiKey.id)}
            className="text-destructive hover:text-destructive hover:bg-destructive/10"
          >
            Revoke
          </Button>
        ) : (
          <span className="text-sm text-muted-foreground">&mdash;</span>
        )}
      </TableCell>
    </TableRow>
  );
}
