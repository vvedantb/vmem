"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardBody } from "@heroui/card";
import { Button } from "@heroui/button";
import {
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
} from "@heroui/table";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Chip,
  Skeleton,
  addToast,
} from "@heroui/react";
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

// Format relative time (e.g., "2 hours ago", "Yesterday")
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

// Format date for display
function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// Format number with commas
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
    // test
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
      addToast({
        title: "Copied!",
        description: "Masked key copied to clipboard",
        color: "success",
      });

      setTimeout(() => setCopiedKeyId(null), 2000);
    } catch {
      addToast({
        title: "Error",
        description: "Failed to copy to clipboard",
        color: "danger",
      });
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

      // Update local state
      setApiKeys((prev) =>
        prev.map((key) =>
          key.id === revokeKeyId ? { ...key, status: "revoked" as const } : key
        )
      );

      addToast({
        title: "Key Revoked",
        description: "The API key has been revoked successfully",
        color: "success",
      });

      setRevokeKeyId(null);
    } catch (err) {
      addToast({
        title: "Error",
        description:
          err instanceof Error ? err.message : "Failed to revoke API key",
        color: "danger",
      });
    } finally {
      setIsRevoking(false);
    }
  };

  const keyToRevoke = apiKeys.find((key) => key.id === revokeKeyId);

  // Loading skeleton
  if (isLoading) {
    return (
      <>
        <Card
          classNames={{
            base: "border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02] shadow-none",
          }}
        >
          <CardBody className="p-6">
            <div className="flex items-start gap-4">
              <Skeleton className="w-10 h-10 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-32 rounded" />
                <Skeleton className="h-4 w-full rounded" />
              </div>
            </div>
          </CardBody>
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

  // Error state
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
          onPress={fetchApiKeys}
          className="bg-black dark:bg-white text-white dark:text-black"
        >
          Try again
        </Button>
      </div>
    );
  }

  return (
    <>
      <Card
        classNames={{
          base: "border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02] shadow-none",
        }}
      >
        <CardBody className="p-6">
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
        </CardBody>
      </Card>

      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium text-black dark:text-white">
          Your API Keys
        </h3>
        <Button
          onPress={() => setIsCreateModalOpen(true)}
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
            onPress={() => setIsCreateModalOpen(true)}
            className="bg-black dark:bg-white text-white dark:text-black"
          >
            Create New Key
          </Button>
        </div>
      ) : (
        <Table
          aria-label="API Keys table"
          classNames={{
            wrapper:
              "border border-black/10 dark:border-white/10 rounded-xl shadow-none bg-transparent",
            th: "bg-black/[0.02] dark:bg-white/[0.02] text-neutral-500 font-medium",
            td: "py-4",
          }}
        >
          <TableHeader>
            <TableColumn>NAME</TableColumn>
            <TableColumn className="hidden md:table-cell">KEY</TableColumn>
            <TableColumn className="hidden lg:table-cell">REQUESTS</TableColumn>
            <TableColumn>LAST USED</TableColumn>
            <TableColumn>ACTIONS</TableColumn>
          </TableHeader>
          <TableBody>
            {apiKeys.map((apiKey) => (
              <TableRow key={apiKey.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className="text-neutral-800 dark:text-neutral-200">
                      {apiKey.name}
                    </span>
                    {apiKey.status === "revoked" && (
                      <Chip
                        size="sm"
                        variant="flat"
                        classNames={{
                          base: "bg-red-100 dark:bg-red-900/30",
                          content: "text-red-600 dark:text-red-400 text-xs",
                        }}
                      >
                        Revoked
                      </Chip>
                    )}
                  </div>
                  <p className="text-xs text-neutral-400 mt-0.5 md:hidden">
                    {formatDate(apiKey.createdAt)}
                  </p>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <div className="flex items-center gap-2">
                    <code className="text-sm text-neutral-500 font-mono">
                      {apiKey.maskedKey}
                    </code>
                    <Button
                      size="sm"
                      variant="light"
                      isIconOnly
                      onPress={() => handleCopyKey(apiKey.maskedKey, apiKey.id)}
                      className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 min-w-6 w-6 h-6"
                    >
                      {copiedKeyId === apiKey.id ? (
                        <IconCheck size={14} />
                      ) : (
                        <IconCopy size={14} />
                      )}
                    </Button>
                  </div>
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  <span className="text-sm text-neutral-500 tabular-nums">
                    {formatNumber(apiKey.requestCount)}
                  </span>
                </TableCell>
                <TableCell>
                  <span className="text-sm text-neutral-500">
                    {formatRelativeTime(apiKey.lastUsedAt)}
                  </span>
                </TableCell>
                <TableCell>
                  {apiKey.status === "active" ? (
                    <Button
                      variant="light"
                      size="sm"
                      onPress={() => setRevokeKeyId(apiKey.id)}
                      className="text-red-500 hover:text-red-600 dark:hover:text-red-400"
                    >
                      Revoke
                    </Button>
                  ) : (
                    <span className="text-sm text-neutral-400">—</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Create API Key Modal */}
      <ApiKeyModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onKeyCreated={fetchApiKeys}
      />

      {/* Revoke Confirmation Modal */}
      <Modal
        isOpen={!!revokeKeyId}
        onClose={() => !isRevoking && setRevokeKeyId(null)}
        size="sm"
        isDismissable={!isRevoking}
        classNames={{
          base: "bg-white dark:bg-neutral-900 border border-black/10 dark:border-white/10",
          header: "border-b border-black/10 dark:border-white/10",
          body: "py-6",
          footer: "border-t border-black/10 dark:border-white/10",
        }}
      >
        <ModalContent>
          <ModalHeader className="text-neutral-800 dark:text-neutral-200">
            Revoke API Key
          </ModalHeader>
          <ModalBody>
            <div className="flex items-start gap-3">
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
          </ModalBody>
          <ModalFooter>
            <Button
              variant="light"
              onPress={() => setRevokeKeyId(null)}
              isDisabled={isRevoking}
              className="text-neutral-600 dark:text-neutral-400"
            >
              Cancel
            </Button>
            <Button
              onPress={handleRevoke}
              isDisabled={isRevoking}
              className="bg-red-500 text-white"
              startContent={
                isRevoking ? (
                  <IconLoader2 size={16} className="animate-spin" />
                ) : null
              }
            >
              {isRevoking ? "Revoking..." : "Revoke Key"}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
}
