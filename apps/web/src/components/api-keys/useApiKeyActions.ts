"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useMutation, useAction } from "convex/react";
import { toast } from "sonner";
import { api } from "@vmem/backend";
import type { FunctionReturnType } from "convex/server";

type ApiKey = FunctionReturnType<typeof api.apiKeys.listMy>[number];

export function useApiKeyActions() {
  const revokeApiKey = useMutation(api.apiKeys.revokeMy).withOptimisticUpdate(
    (localStore, args) => {
      const list = localStore.getQuery(api.apiKeys.listMy, {});
      if (!list) return;
      localStore.setQuery(
        api.apiKeys.listMy,
        {},
        list.map((row) =>
          row.id === args.id ? { ...row, status: "revoked" } : row,
        ),
      );
    },
  );
  const revealApiKey = useAction(api.apiKeys.revealMy);

  const [revokeKeyId, setRevokeKeyId] = useState<ApiKey["id"] | null>(null);
  const [isRevoking, setIsRevoking] = useState(false);
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);
  const [copyingKeyId, setCopyingKeyId] = useState<string | null>(null);
  const [revealedKeys, setRevealedKeys] = useState<
    Partial<Record<string, string>>
  >({});
  const [revealingKeyId, setRevealingKeyId] = useState<string | null>(null);

  const copiedTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    };
  }, []);

  const handleCopyKey = useCallback(
    async (apiKeyId: ApiKey["id"]) => {
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
        if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
        copiedTimerRef.current = setTimeout(() => setCopiedKeyId(null), 2000);
      } catch {
        toast.error("Failed to copy to clipboard");
      }
    },
    [revealedKeys, revealApiKey],
  );

  const handleToggleReveal = useCallback(
    async (apiKeyId: ApiKey["id"]) => {
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
    },
    [revealedKeys, revealApiKey],
  );

  const handleRevoke = useCallback(async () => {
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
  }, [revokeKeyId, revokeApiKey]);

  return {
    revokeKeyId,
    setRevokeKeyId,
    isRevoking,
    copiedKeyId,
    copyingKeyId,
    revealedKeys,
    revealingKeyId,
    handleCopyKey,
    handleToggleReveal,
    handleRevoke,
  };
}
