import { useQuery } from "convex/react";
import {
  Button,
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
} from "@vmem/ui";
import { IconPlus } from "@tabler/icons-react";
import { AnimatedKeyIcon, VmemSpinner } from "@/components/icons/animations";
import ApiKeyModal from "@/components/api-keys/ApiKeyModal";
import { ApiKeyRow } from "@/components/api-keys/ApiKeyRow";
import DestructiveConfirmDialog from "@/components/settings/DestructiveConfirmDialog";
import { EditKeyDialog } from "@/components/api-keys/EditKeyDialog";
import { useApiKeyActions } from "@/components/api-keys/useApiKeyActions";
import type { ApiKey } from "@/components/api-keys/types";
import { api } from "@vmem/backend";
import { useApiCreateKeyModal } from "./ApiCreateKeyContext";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { SettingsEmptyState } from "@/components/settings/SettingsEmptyState";

export function KeysPanel() {
  const { isCreateModalOpen, setIsCreateModalOpen } = useApiCreateKeyModal();
  const apiKeys = useQuery(api.apiKeys.listMy, {});

  const {
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
  } = useApiKeyActions();

  const isLoading = apiKeys === undefined;
  const apiKeyList: ApiKey[] = apiKeys ?? [];
  const keyToRevoke = apiKeyList.find((key) => key.id === revokeKeyId);
  const keyToDelete = apiKeyList.find((key) => key.id === deleteKeyId);
  const keyToEdit = apiKeyList.find((key) => key.id === editKeyId) ?? null;

  if (isLoading) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center">
        <VmemSpinner size={24} className="text-muted" />
      </div>
    );
  }

  return (
    <>
      {apiKeyList.length === 0 ? (
        <SettingsSection title="API keys">
          <SettingsEmptyState
            icon={AnimatedKeyIcon}
            title="No API keys yet"
            description="Create your first API key to start using vMemory programmatically."
            action={
              <Button
                variant="outline"
                size="sm"
                aria-label="New Key"
                onClick={() => setIsCreateModalOpen(true)}
              >
                <IconPlus size={16} />
                New Key
              </Button>
            }
          />
        </SettingsSection>
      ) : (
        <SettingsSection title="API keys" bodyVariant="list">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="font-medium text-muted">NAME</TableHead>
                <TableHead className="hidden font-medium text-muted sm:table-cell">
                  STATUS
                </TableHead>
                <TableHead className="hidden font-medium text-muted md:table-cell">
                  KEY
                </TableHead>
                <TableHead className="hidden font-medium text-muted lg:table-cell">
                  REQUESTS
                </TableHead>
                <TableHead className="hidden font-medium text-muted sm:table-cell">
                  LAST USED
                </TableHead>
                <TableHead className="text-right font-medium text-muted sm:w-auto">
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
                  onEdit={setEditKeyId}
                  onRevoke={setRevokeKeyId}
                  onDelete={setDeleteKeyId}
                />
              ))}
            </TableBody>
          </Table>
        </SettingsSection>
      )}

      <ApiKeyModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
      />

      <DestructiveConfirmDialog
        open={!!revokeKeyId}
        onClose={() => setRevokeKeyId(null)}
        title="Revoke API Key"
        description="This action cannot be undone. Any applications using this key will immediately lose access."
        confirmLabel="Revoke Key"
        submittingLabel="Revoking..."
        submitting={isRevoking}
        onConfirm={() => void handleRevoke()}
      >
        Are you sure you want to revoke{" "}
        <span className="font-medium">{keyToRevoke?.name}</span>?
      </DestructiveConfirmDialog>

      <DestructiveConfirmDialog
        open={!!deleteKeyId}
        onClose={() => setDeleteKeyId(null)}
        title="Delete API Key"
        description="This removes the key from your account. Active keys stop working immediately. This cannot be undone."
        confirmLabel="Delete Key"
        submittingLabel="Deleting..."
        submitting={isDeleting}
        onConfirm={() => void handleDelete()}
      >
        Delete <span className="font-medium">{keyToDelete?.name}</span>{" "}
        permanently?
      </DestructiveConfirmDialog>

      <EditKeyDialog
        apiKey={keyToEdit}
        isOpen={!!editKeyId}
        onClose={() => setEditKeyId(null)}
      />
    </>
  );
}
