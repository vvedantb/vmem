import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@vmem/backend";
import { SettingsPage } from "@/components/settings/SettingsPage";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { EnvVarsTable } from "@/components/settings/EnvVarsTable";

export function SecretsClient() {
  const vars = useQuery(api.userEnvVars.list, {});
  const upsert = useAction(api.userEnvVarsActions.upsertVar);
  const edit = useAction(api.userEnvVarsActions.editVar);
  const reveal = useAction(api.userEnvVarsActions.revealValue);
  const remove = useMutation(api.userEnvVars.removeVar).withOptimisticUpdate(
    (localStore, args) => {
      const list = localStore.getQuery(api.userEnvVars.list, {});
      if (list === undefined) return;
      localStore.setQuery(
        api.userEnvVars.list,
        {},
        list.filter((entry) => entry.key !== args.key),
      );
    },
  );
  const bulkImport = useAction(api.userEnvVarsActions.bulkUpsert);

  return (
    <SettingsPage title="Secrets">
      <SettingsSection
        title="Encrypted secrets"
        description="Secrets (e.g. TYPESAFE_API_KEY) used by server-side actions when calling third-party providers on your behalf. OPENROUTER_API_KEY is set on the Convex deployment, not here. Values are encrypted at rest."
      />
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
    </SettingsPage>
  );
}
