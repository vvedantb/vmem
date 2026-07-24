import { useState } from "react";
import { useMutation, useAction } from "convex/react";
import { useCopyToClipboard, useTimeout } from "usehooks-ts";
import { toast } from "sonner";
import { api } from "@vmem/backend";
import type { ApiKey } from "./types";

export function useApiKeyActions() {
  const revokeApiKey = useMutation(api.apiKeys.revokeMy).withOptimisticUpdate(
    (localStore, args) => {
      const list = localStore.getQuery(api.apiKeys.listMy, {});
      if (list === undefined) return;
      localStore.setQuery(
        api.apiKeys.listMy,
        {},
        list.map((key) =>
          key.id === args.id ? { ...key, status: "revoked" as const } : key,
        ),
      );
    },
  );
  const deleteApiKey = useMutation(api.apiKeys.deleteMy).withOptimisticUpdate(
    (localStore, args) => {
      const list = localStore.getQuery(api.apiKeys.listMy, {});
      if (list === undefined) return;
      localStore.setQuery(
        api.apiKeys.listMy,
        {},
        list.filter((key) => key.id !== args.id),
      );
    },
  );
  const revealApiKey = useAction(api.apiKeys.revealMy);
  const [, copyToClipboard] = useCopyToClipboard();

  const [revokeKeyId, setRevokeKeyId] = useState<ApiKey["id"] | null>(null);
  const [deleteKeyId, setDeleteKeyId] = useState<ApiKey["id"] | null>(null);
  const [editKeyId, setEditKeyId] = useState<ApiKey["id"] | null>(null);
  const [isRevoking, setIsRevoking] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [copiedKeyId, setCopiedKeyId] = useState<ApiKey["id"] | null>(null);
  const [copyingKeyId, setCopyingKeyId] = useState<ApiKey["id"] | null>(null);
  const [revealedKeys, setRevealedKeys] = useState<
    Partial<Record<ApiKey["id"], string>>
  >({});
  const [revealingKeyId, setRevealingKeyId] = useState<ApiKey["id"] | null>(
    null,
  );

  useTimeout(() => setCopiedKeyId(null), copiedKeyId !== null ? 2000 : null);

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
    const copied = await copyToClipboard(keyToCopy);
    if (!copied) {
      toast.error("Failed to copy to clipboard");
      return;
    }
    setCopiedKeyId(apiKeyId);
    toast.success("API key copied to clipboard");
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

  const handleDelete = async () => {
    if (!deleteKeyId) return;

    setIsDeleting(true);
    try {
      const deleted = await deleteApiKey({ id: deleteKeyId });
      if (!deleted) {
        throw new Error("Failed to delete API key");
      }
      toast.success("The API key has been deleted");
      setDeleteKeyId(null);
      setRevealedKeys((prev) => {
        if (!(deleteKeyId in prev)) return prev;
        const next = { ...prev };
        delete next[deleteKeyId];
        return next;
      });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to delete API key",
      );
    } finally {
      setIsDeleting(false);
    }
  };

  return {
    revokeKeyId,
    setRevokeKeyId,
    deleteKeyId,
    setDeleteKeyId,
    editKeyId,
    setEditKeyId,
    isRevoking,
    isDeleting,
    copiedKeyId,
    copyingKeyId,
    revealedKeys,
    revealingKeyId,
    handleCopyKey,
    handleToggleReveal,
    handleRevoke,
    handleDelete,
  };
}
