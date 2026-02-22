"use client";

import { useState } from "react";
import { useMutation, useQuery, useAction } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  Card,
  CardContent,
  Button,
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Badge,
  Skeleton,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@vmem/ui";
import { toast } from "sonner";
import {
  IconBolt,
  IconLoader2,
  IconCopy,
  IconCheck,
  IconAlertTriangle,
  IconEye,
  IconEyeOff,
} from "@tabler/icons-react";
import ApiKeyModal from "@/components/ApiKeyModal";
import { api } from "@vmem/backend";
type ApiKey = FunctionReturnType<typeof api.apiKeys.listMy>[number];

function formatRelativeTime(dateString: string | null): string {
  if (!dateString) return "Never";

  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return date.toLocaleDateString();
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatNumber(num: number): string {
  return num.toLocaleString();
}

export default function ApiKeysPage() {
  const apiKeys = useQuery(api.apiKeys.listMy, {});
  const revokeApiKey = useMutation(api.apiKeys.revokeMy);
  const revealApiKey = useAction(api.apiKeys.revealMy);

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [revokeKeyId, setRevokeKeyId] = useState<ApiKey["id"] | null>(null);
  const [isRevoking, setIsRevoking] = useState(false);
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);
  const [copyingKeyId, setCopyingKeyId] = useState<string | null>(null);
  const [revealedKeys, setRevealedKeys] = useState<
    Partial<Record<string, string>>
  >({});
  const [revealingKeyId, setRevealingKeyId] = useState<string | null>(null);
  const isLoading = apiKeys === undefined;
  const apiKeyList: ApiKey[] = apiKeys ?? [];

  const handleCopyKey = async (apiKeyId: ApiKey["id"]) => {
    const existing = revealedKeys[apiKeyId];
    const keyToCopy =
      existing ??
      (await (async () => {
        setCopyingKeyId(apiKeyId);
        try {
          return await revealApiKey({ id: apiKeyId });
        } catch {
          toast.error("Failed to retrieve API key");
          return null;
        } finally {
          setCopyingKeyId(null);
        }
      })());

    if (!keyToCopy) return;
    try {
      await navigator.clipboard.writeText(keyToCopy);
      setCopiedKeyId(apiKeyId);
      toast.success("API key copied to clipboard");
      setTimeout(() => setCopiedKeyId(null), 2000);
    } catch {
      toast.error("Failed to copy to clipboard");
    }
  };

  const handleToggleReveal = async (apiKeyId: ApiKey["id"]) => {
    if (revealedKeys[apiKeyId]) {
      setRevealedKeys((prev) => {
        const next = { ...prev };
        delete next[apiKeyId];
        return next;
      });
      return;
    }

    setRevealingKeyId(apiKeyId);
    try {
      const rawKey = await revealApiKey({ id: apiKeyId });
      if (!rawKey) {
        toast.error("Could not reveal API key");
        return;
      }
      setRevealedKeys((prev) => ({ ...prev, [apiKeyId]: rawKey }));
    } catch {
      toast.error("Failed to reveal API key");
    } finally {
      setRevealingKeyId(null);
    }
  };

  const handleRevoke = async () => {
    if (!revokeKeyId) return;

    setIsRevoking(true);

    try {
      const revoked = await revokeApiKey({ id: revokeKeyId });
      if (!revoked) {
        throw new Error("Failed to revoke API key");
      }

      toast.success("The API key has been revoked successfully");
      setRevokeKeyId(null);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to revoke API key",
      );
    } finally {
      setIsRevoking(false);
    }
  };

  const keyToRevoke = apiKeyList.find((key) => key.id === revokeKeyId);

  if (isLoading) {
    return (
      <>
        <Card className="border border-border bg-muted/50 shadow-none">
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <Skeleton className="w-10 h-10 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-32 rounded" />
                <Skeleton className="h-4 w-full rounded" />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-between items-center">
          <Skeleton className="h-6 w-32 rounded" />
          <Skeleton className="h-10 w-32 rounded-lg" />
        </div>

        <div className="border border-border rounded-xl overflow-hidden">
          <div className="bg-muted/50 p-4 border-b border-border">
            <div className="flex gap-4">
              <Skeleton className="h-4 w-20 rounded" />
              <Skeleton className="h-4 w-40 rounded" />
              <Skeleton className="h-4 w-24 rounded" />
              <Skeleton className="h-4 w-20 rounded" />
            </div>
          </div>
          {[1, 2, 3].map((i) => (
            <div key={i} className="p-4 border-b border-border">
              <div className="flex items-center gap-4">
                <Skeleton className="h-5 w-28 rounded" />
                <Skeleton className="h-5 w-48 rounded" />
                <Skeleton className="h-5 w-16 rounded" />
                <Skeleton className="h-5 w-16 rounded" />
                <Skeleton className="h-8 w-16 rounded" />
              </div>
            </div>
          ))}
        </div>
      </>
    );
  }

  return (
    <>
      <Card className="border border-border bg-muted/50 shadow-none">
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-lg bg-muted border border-border flex items-center justify-center flex-shrink-0">
              <IconBolt
                className="w-5 h-5 text-muted-foreground"
                stroke={1.5}
              />
            </div>
            <div>
              <h3 className="font-medium text-foreground">MCP Integration</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Use your API key to connect vMemory with MCP-compatible clients.
                Your memories will be accessible through the Model Context
                Protocol.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium text-foreground">Your API Keys</h3>
        <Button
          onClick={() => setIsCreateModalOpen(true)}
          className="bg-primary text-primary-foreground font-medium"
        >
          Create New Key
        </Button>
      </div>

      {apiKeyList.length === 0 ? (
        <div className="py-16 text-center border border-border rounded-xl">
          <IconBolt
            size={48}
            className="mx-auto text-muted-foreground mb-4"
            stroke={1.5}
          />
          <h3 className="text-lg font-medium text-foreground mb-2">
            No API keys yet
          </h3>
          <p className="text-muted-foreground mb-6">
            Create your first API key to start using vMemory programmatically.
          </p>
          <Button
            onClick={() => setIsCreateModalOpen(true)}
            className="bg-primary text-primary-foreground"
          >
            Create New Key
          </Button>
        </div>
      ) : (
        <Table className="border border-border rounded-xl">
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="text-muted-foreground font-medium">
                NAME
              </TableHead>
              <TableHead className="hidden md:table-cell text-muted-foreground font-medium">
                KEY
              </TableHead>
              <TableHead className="hidden lg:table-cell text-muted-foreground font-medium">
                REQUESTS
              </TableHead>
              <TableHead className="text-muted-foreground font-medium">
                LAST USED
              </TableHead>
              <TableHead className="text-muted-foreground font-medium">
                ACTIONS
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {apiKeyList.map((apiKey) => (
              <TableRow key={apiKey.id}>
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
                      {revealedKeys[apiKey.id] ?? "vmem_sk_••••••••••••••••"}
                    </code>
                    {apiKey.status === "active" && (
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        onClick={() => handleToggleReveal(apiKey.id)}
                        disabled={revealingKeyId === apiKey.id}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        {revealingKeyId === apiKey.id ? (
                          <IconLoader2 size={14} className="animate-spin" />
                        ) : revealedKeys[apiKey.id] ? (
                          <IconEyeOff size={14} />
                        ) : (
                          <IconEye size={14} />
                        )}
                      </Button>
                    )}
                    {apiKey.status === "active" && (
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        onClick={() => handleCopyKey(apiKey.id)}
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
                <TableCell className="py-4">
                  <span className="text-sm text-muted-foreground">
                    {formatRelativeTime(apiKey.lastUsedAt)}
                  </span>
                </TableCell>
                <TableCell className="py-4">
                  {apiKey.status === "active" ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setRevokeKeyId(apiKey.id)}
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      Revoke
                    </Button>
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      &mdash;
                    </span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <ApiKeyModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onKeyCreated={() => {}}
      />

      <Dialog
        open={!!revokeKeyId}
        onOpenChange={(open) => {
          if (!open && !isRevoking) setRevokeKeyId(null);
        }}
      >
        <DialogContent className="sm:max-w-sm bg-card border border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">
              Revoke API Key
            </DialogTitle>
            <DialogDescription className="sr-only">
              Confirm revoking an API key
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-start gap-3 py-4">
            <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center flex-shrink-0">
              <IconAlertTriangle size={20} className="text-destructive" />
            </div>
            <div>
              <p className="text-foreground">
                Are you sure you want to revoke{" "}
                <span className="font-medium">{keyToRevoke?.name}</span>?
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                This action cannot be undone. Any applications using this key
                will immediately lose access.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setRevokeKeyId(null)}
              disabled={isRevoking}
              className="text-muted-foreground"
            >
              Cancel
            </Button>
            <Button
              onClick={handleRevoke}
              disabled={isRevoking}
              className="bg-destructive text-primary-foreground"
            >
              {isRevoking ? (
                <>
                  <IconLoader2 size={16} className="animate-spin" />
                  Revoking...
                </>
              ) : (
                "Revoke Key"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
