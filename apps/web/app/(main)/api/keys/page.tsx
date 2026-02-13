"use client";

import { useState, useEffect, useCallback } from "react";
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
  IconAlertCircle,
  IconCopy,
  IconCheck,
  IconAlertTriangle,
} from "@tabler/icons-react";
import ApiKeyModal from "@/components/ApiKeyModal";

interface ApiKey {
  id: string;
  name: string;
  maskedKey: string;
  createdAt: string;
  lastUsedAt: string | null;
  requestCount: number;
  status: "active" | "revoked";
}

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
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [revokeKeyId, setRevokeKeyId] = useState<string | null>(null);
  const [isRevoking, setIsRevoking] = useState(false);
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);

  const fetchApiKeys = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/key");
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to fetch API keys");
      }

      setApiKeys(data.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load API keys");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchApiKeys();
  }, [fetchApiKeys]);

  const handleCopyKey = async (maskedKey: string, keyId: string) => {
    try {
      await navigator.clipboard.writeText(maskedKey);
      setCopiedKeyId(keyId);
      toast.success("Masked key copied to clipboard");
      setTimeout(() => setCopiedKeyId(null), 2000);
    } catch {
      toast.error("Failed to copy to clipboard");
    }
  };

  const handleRevoke = async () => {
    if (!revokeKeyId) return;

    setIsRevoking(true);

    try {
      const response = await fetch(`/api/key/${revokeKeyId}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to revoke API key");
      }

      setApiKeys((prev) =>
        prev.map((key) =>
          key.id === revokeKeyId ? { ...key, status: "revoked" as const } : key,
        ),
      );

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

  const keyToRevoke = apiKeys.find((key) => key.id === revokeKeyId);

  if (isLoading) {
    return (
      <>
        <Card className="border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02] shadow-none">
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

        <div className="border border-black/10 dark:border-white/10 rounded-xl overflow-hidden">
          <div className="bg-black/[0.02] dark:bg-white/[0.02] p-4 border-b border-black/10 dark:border-white/10">
            <div className="flex gap-4">
              <Skeleton className="h-4 w-20 rounded" />
              <Skeleton className="h-4 w-40 rounded" />
              <Skeleton className="h-4 w-24 rounded" />
              <Skeleton className="h-4 w-20 rounded" />
            </div>
          </div>
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="p-4 border-b border-black/5 dark:border-white/5"
            >
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

  if (error) {
    return (
      <div className="py-16 text-center">
        <IconAlertCircle
          size={48}
          className="mx-auto text-red-500 mb-4"
          stroke={1.5}
        />
        <h3 className="text-lg font-medium text-neutral-800 dark:text-neutral-200 mb-2">
          Failed to load API keys
        </h3>
        <p className="text-neutral-500 mb-6">{error}</p>
        <Button
          onClick={fetchApiKeys}
          className="bg-black dark:bg-white text-white dark:text-black"
        >
          Try again
        </Button>
      </div>
    );
  }

  return (
    <>
      <Card className="border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02] shadow-none">
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-lg bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 flex items-center justify-center flex-shrink-0">
              <IconBolt
                className="w-5 h-5 text-neutral-600 dark:text-neutral-400"
                stroke={1.5}
              />
            </div>
            <div>
              <h3 className="font-medium text-black dark:text-white">
                MCP Integration
              </h3>
              <p className="text-sm text-neutral-500 mt-1">
                Use your API key to connect vMemory with MCP-compatible clients.
                Your memories will be accessible through the Model Context
                Protocol.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium text-black dark:text-white">
          Your API Keys
        </h3>
        <Button
          onClick={() => setIsCreateModalOpen(true)}
          className="bg-black dark:bg-white text-white dark:text-black font-medium"
        >
          Create New Key
        </Button>
      </div>

      {apiKeys.length === 0 ? (
        <div className="py-16 text-center border border-black/10 dark:border-white/10 rounded-xl">
          <IconBolt
            size={48}
            className="mx-auto text-neutral-300 dark:text-neutral-600 mb-4"
            stroke={1.5}
          />
          <h3 className="text-lg font-medium text-neutral-800 dark:text-neutral-200 mb-2">
            No API keys yet
          </h3>
          <p className="text-neutral-500 mb-6">
            Create your first API key to start using vMemory programmatically.
          </p>
          <Button
            onClick={() => setIsCreateModalOpen(true)}
            className="bg-black dark:bg-white text-white dark:text-black"
          >
            Create New Key
          </Button>
        </div>
      ) : (
        <Table className="border border-black/10 dark:border-white/10 rounded-xl">
          <TableHeader>
            <TableRow className="bg-black/[0.02] dark:bg-white/[0.02]">
              <TableHead className="text-neutral-500 font-medium">
                NAME
              </TableHead>
              <TableHead className="hidden md:table-cell text-neutral-500 font-medium">
                KEY
              </TableHead>
              <TableHead className="hidden lg:table-cell text-neutral-500 font-medium">
                REQUESTS
              </TableHead>
              <TableHead className="text-neutral-500 font-medium">
                LAST USED
              </TableHead>
              <TableHead className="text-neutral-500 font-medium">
                ACTIONS
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {apiKeys.map((apiKey) => (
              <TableRow key={apiKey.id}>
                <TableCell className="py-4">
                  <div className="flex items-center gap-2">
                    <span className="text-neutral-800 dark:text-neutral-200">
                      {apiKey.name}
                    </span>
                    {apiKey.status === "revoked" && (
                      <Badge className="bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-xs">
                        Revoked
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-neutral-400 mt-0.5 md:hidden">
                    {formatDate(apiKey.createdAt)}
                  </p>
                </TableCell>
                <TableCell className="hidden md:table-cell py-4">
                  <div className="flex items-center gap-2">
                    <code className="text-sm text-neutral-500 font-mono">
                      {apiKey.maskedKey}
                    </code>
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      onClick={() => handleCopyKey(apiKey.maskedKey, apiKey.id)}
                      className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
                    >
                      {copiedKeyId === apiKey.id ? (
                        <IconCheck size={14} />
                      ) : (
                        <IconCopy size={14} />
                      )}
                    </Button>
                  </div>
                </TableCell>
                <TableCell className="hidden lg:table-cell py-4">
                  <span className="text-sm text-neutral-500 tabular-nums">
                    {formatNumber(apiKey.requestCount)}
                  </span>
                </TableCell>
                <TableCell className="py-4">
                  <span className="text-sm text-neutral-500">
                    {formatRelativeTime(apiKey.lastUsedAt)}
                  </span>
                </TableCell>
                <TableCell className="py-4">
                  {apiKey.status === "active" ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setRevokeKeyId(apiKey.id)}
                      className="text-red-500 hover:text-red-600 dark:hover:text-red-400"
                    >
                      Revoke
                    </Button>
                  ) : (
                    <span className="text-sm text-neutral-400">&mdash;</span>
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
        onKeyCreated={fetchApiKeys}
      />

      <Dialog
        open={!!revokeKeyId}
        onOpenChange={(open) => {
          if (!open && !isRevoking) setRevokeKeyId(null);
        }}
      >
        <DialogContent className="sm:max-w-sm bg-white dark:bg-neutral-900 border border-black/10 dark:border-white/10">
          <DialogHeader>
            <DialogTitle className="text-neutral-800 dark:text-neutral-200">
              Revoke API Key
            </DialogTitle>
            <DialogDescription className="sr-only">
              Confirm revoking an API key
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-start gap-3 py-4">
            <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
              <IconAlertTriangle size={20} className="text-red-500" />
            </div>
            <div>
              <p className="text-neutral-800 dark:text-neutral-200">
                Are you sure you want to revoke{" "}
                <span className="font-medium">{keyToRevoke?.name}</span>?
              </p>
              <p className="text-sm text-neutral-500 mt-1">
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
              className="text-neutral-600 dark:text-neutral-400"
            >
              Cancel
            </Button>
            <Button
              onClick={handleRevoke}
              disabled={isRevoking}
              className="bg-red-500 text-white"
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
