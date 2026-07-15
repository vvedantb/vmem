import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useAction } from "convex/react";
import { IconInfoCircle } from "@tabler/icons-react";
import { api } from "@vmem/backend";
import { Card, CardContent } from "@vmem/ui";
import PageContainer from "@/components/shell/PageContainer";
import { EnvVarsTable } from "@/components/settings/EnvVarsTable";

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
      <div className="space-y-6">
        <Card className="shadow-none">
          <CardContent className="flex items-start gap-3 p-4">
            <IconInfoCircle
              className="mt-0.5 h-4 w-4 shrink-0 text-muted"
              stroke={1.5}
            />
            <p className="text-sm text-muted text-balance">
              Secrets (e.g. OPENROUTER_API_KEY) used by server-side actions when
              calling third-party providers on your behalf. Values are encrypted
              at rest.
            </p>
          </CardContent>
        </Card>

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
        />
      </div>
    </PageContainer>
  );
}
