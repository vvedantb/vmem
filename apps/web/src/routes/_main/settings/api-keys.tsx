import { createFileRoute } from "@tanstack/react-router";
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
import { AnimatedKeyIcon } from "@/components/svg-animations";
import ApiKeyModal from "@/components/ApiKeyModal";
import { ApiKeyRow } from "@/components/api-keys/ApiKeyRow";
import { ApiKeysLoadingSkeleton } from "@/components/api-keys/ApiKeysLoadingSkeleton";
import { RevokeKeyDialog } from "@/components/api-keys/RevokeKeyDialog";
import { useApiKeyActions } from "@/components/api-keys/useApiKeyActions";
import PageContainer from "@/components/PageContainer";
import { api } from "@vmem/backend";

type ApiKey = FunctionReturnType<typeof api.apiKeys.listMy>[number];

export const Route = createFileRoute("/_main/settings/api-keys")({
  component: ApiKeysPage,
});

function ApiKeysPage() {
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
    return (
      <PageContainer title="API Keys" centeredMaxWidth>
        <ApiKeysLoadingSkeleton />
      </PageContainer>
    );
  }

  return (
    <PageContainer
      title="API Keys"
      centeredMaxWidth
      rightSection={
        <Button
          onClick={() => setIsCreateModalOpen(true)}
          className="bg-primary font-medium text-primary-foreground"
        >
          Create New Key
        </Button>
      }
    >
      {apiKeyList.length === 0 ? (
        <div className="rounded-xl border border-border py-16 text-center">
          <AnimatedKeyIcon
            size={48}
            className="mx-auto mb-4 text-muted-foreground"
          />
          <h3 className="mb-2 text-lg font-medium text-foreground">
            No API keys yet
          </h3>
          <p className="mb-6 text-muted-foreground">
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
        <Table className="rounded-xl border border-border">
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="font-medium text-muted-foreground">
                NAME
              </TableHead>
              <TableHead className="hidden font-medium text-muted-foreground sm:table-cell">
                STATUS
              </TableHead>
              <TableHead className="hidden font-medium text-muted-foreground md:table-cell">
                KEY
              </TableHead>
              <TableHead className="hidden font-medium text-muted-foreground lg:table-cell">
                REQUESTS
              </TableHead>
              <TableHead className="hidden font-medium text-muted-foreground sm:table-cell">
                LAST USED
              </TableHead>
              <TableHead className="w-20 font-medium text-muted-foreground sm:w-auto">
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
    </PageContainer>
  );
}
