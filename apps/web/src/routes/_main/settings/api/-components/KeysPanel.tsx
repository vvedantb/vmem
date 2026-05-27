import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  Button,
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  Card,
  CardContent,
} from "@vmem/ui";
import { IconPlus } from "@tabler/icons-react";
import { AnimatedKeyIcon } from "@/components/svg-animations";
import ApiKeyModal from "@/components/ApiKeyModal";
import { ApiKeyRow } from "@/components/api-keys/ApiKeyRow";
import { ApiKeysLoadingSkeleton } from "@/components/api-keys/ApiKeysLoadingSkeleton";
import { RevokeKeyDialog } from "@/components/api-keys/RevokeKeyDialog";
import { DeleteKeyDialog } from "@/components/api-keys/DeleteKeyDialog";
import { EditKeyDialog } from "@/components/api-keys/EditKeyDialog";
import { useApiKeyActions } from "@/components/api-keys/useApiKeyActions";
import { api } from "@vmem/backend";

type ApiKey = FunctionReturnType<typeof api.apiKeys.listMy>[number];

/**
 * Keys panel for `/settings/api`. The "create" modal is controlled by
 * the orchestrator so the right-section "New Key" button (in the page
 * header) and the empty-state "New Key" button can both open it.
 */
export function KeysPanel({
  isCreateModalOpen,
  onCreateModalOpenChange,
}: {
  isCreateModalOpen: boolean;
  onCreateModalOpenChange: (open: boolean) => void;
}) {
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
    isRenaming,
    copiedKeyId,
    copyingKeyId,
    revealedKeys,
    revealingKeyId,
    handleCopyKey,
    handleToggleReveal,
    handleRevoke,
    handleDelete,
    handleRename,
  } = useApiKeyActions();

  const isLoading = apiKeys === undefined;
  const apiKeyList: ApiKey[] = apiKeys ?? [];
  const keyToRevoke = apiKeyList.find((key) => key.id === revokeKeyId);
  const keyToDelete = apiKeyList.find((key) => key.id === deleteKeyId);
  const keyToEdit = apiKeyList.find((key) => key.id === editKeyId);

  if (isLoading) return <ApiKeysLoadingSkeleton />;

  return (
    <>
      {apiKeyList.length === 0 ? (
        <Card className="shadow-none">
          <CardContent className="py-16 text-center">
            <AnimatedKeyIcon size={48} className="mx-auto mb-4 text-muted" />
            <h3 className="mb-2 text-lg font-medium text-foreground text-balance">
              No API keys yet
            </h3>
            <p className="mb-6 text-muted">
              Create your first API key to start using vMemory programmatically.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onCreateModalOpenChange(true)}
            >
              <IconPlus size={16} />
              New Key
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="shadow-none overflow-hidden">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-surface-tertiary/50">
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
          </CardContent>
        </Card>
      )}

      <ApiKeyModal
        isOpen={isCreateModalOpen}
        onClose={() => onCreateModalOpenChange(false)}
        onKeyCreated={() => {}}
      />

      <RevokeKeyDialog
        keyName={keyToRevoke?.name}
        isOpen={!!revokeKeyId}
        isRevoking={isRevoking}
        onConfirm={handleRevoke}
        onCancel={() => setRevokeKeyId(null)}
      />

      <DeleteKeyDialog
        keyName={keyToDelete?.name}
        isOpen={!!deleteKeyId}
        isDeleting={isDeleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteKeyId(null)}
      />

      <EditKeyDialog
        keyName={keyToEdit?.name}
        isOpen={!!editKeyId}
        isSaving={isRenaming}
        onSave={handleRename}
        onCancel={() => setEditKeyId(null)}
      />
    </>
  );
}
