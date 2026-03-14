"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  Button,
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
} from "@vmem/ui";
import { IconBolt } from "@tabler/icons-react";
import ApiKeyModal from "@/components/ApiKeyModal";
import { ApiKeyRow } from "@/components/api-keys/ApiKeyRow";
import { ApiKeysLoadingSkeleton } from "@/components/api-keys/ApiKeysLoadingSkeleton";
import { RevokeKeyDialog } from "@/components/api-keys/RevokeKeyDialog";
import { useApiKeyActions } from "@/components/api-keys/useApiKeyActions";
import { api } from "@vmem/backend";

type ApiKey = FunctionReturnType<typeof api.apiKeys.listMy>[number];

export default function ApiKeysPage() {
  const apiKeys = useQuery(api.apiKeys.listMy, {});
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const {
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
  } = useApiKeyActions();

  const isLoading = apiKeys === undefined;
  const apiKeyList: ApiKey[] = apiKeys ?? [];
  const keyToRevoke = apiKeyList.find((key) => key.id === revokeKeyId);

  if (isLoading) {
    return <ApiKeysLoadingSkeleton />;
  }

  return (
    <>
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
              <ApiKeyRow
                key={apiKey.id}
                apiKey={apiKey}
                revealedKey={revealedKeys[apiKey.id]}
                revealingKeyId={revealingKeyId}
                copyingKeyId={copyingKeyId}
                copiedKeyId={copiedKeyId}
                onToggleReveal={handleToggleReveal}
                onCopy={handleCopyKey}
                onRevoke={setRevokeKeyId}
              />
            ))}
          </TableBody>
        </Table>
      )}

      <ApiKeyModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onKeyCreated={() => {}}
      />

      <RevokeKeyDialog
        keyName={keyToRevoke?.name}
        isOpen={!!revokeKeyId}
        isRevoking={isRevoking}
        onConfirm={handleRevoke}
        onCancel={() => setRevokeKeyId(null)}
      />
    </>
  );
}
