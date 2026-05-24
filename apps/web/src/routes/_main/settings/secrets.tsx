import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@vmem/backend";
import PageContainer from "@/components/PageContainer";
import { EnvVarsTable } from "@/components/EnvVarsTable";

export const Route = createFileRoute("/_main/settings/secrets")({
  component: SecretsPage,
});

function SecretsPage() {
  const vars = useQuery(api.userEnvVars.list, {});
  const upsert = useAction(api.userEnvVarsActions.upsertVar);
  const edit = useAction(api.userEnvVarsActions.editVar);
  const reveal = useAction(api.userEnvVarsActions.revealValue);
  const remove = useMutation(api.userEnvVars.removeVar);
  const bulkImport = useAction(api.userEnvVarsActions.bulkUpsert);

  return (
    <PageContainer title="Secrets" centeredMaxWidth showTitle>
      <EnvVarsTable
        vars={vars}
        onUpsert={async (key, value) => {
          await upsert({ key, value });
        }}
        onEdit={async (oldKey, newKey, value) => {
          await edit({ oldKey, newKey, value });
        }}
        onReveal={(key) => reveal({ key })}
        onRemove={async (key) => {
          await remove({ key });
        }}
        onBulkImport={async (entries) => {
          await bulkImport({ entries });
        }}
        description="Secrets (e.g. OPENROUTER_API_KEY) used by server-side actions when calling third-party providers on your behalf. Values are encrypted at rest."
      />
    </PageContainer>
  );
}
