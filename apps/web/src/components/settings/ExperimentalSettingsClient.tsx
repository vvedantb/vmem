import { useQuery, useMutation } from "convex/react";
import { api } from "@vmem/backend";
import { Skeleton, Switch } from "@vvedantb/ui";
import { SettingsPage } from "@/components/settings/SettingsPage";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { SettingsToggleRow } from "@/components/settings/SettingsToggleRow";
import { convexErrorMessage } from "@/lib/convex-error";
import { toast } from "sonner";

type ExperimentalFlagKey = "disablePageMotion";

export function ExperimentalSettingsClient() {
  const flags = useQuery(api.userSettings.getExperimentalFlags);
  const setFlag = useMutation(
    api.userSettings.setExperimentalFlag,
  ).withOptimisticUpdate((localStore, args) => {
    const current = localStore.getQuery(
      api.userSettings.getExperimentalFlags,
      {},
    );
    if (current === undefined) return;
    localStore.setQuery(
      api.userSettings.getExperimentalFlags,
      {},
      { ...current, [args.key]: args.enabled },
    );
  });

  const toggle = (key: ExperimentalFlagKey, enabled: boolean) => {
    void setFlag({ key, enabled }).catch((err: unknown) => {
      toast.error(convexErrorMessage(err, "Couldn't update setting"));
    });
  };

  if (flags === undefined) {
    return (
      <SettingsPage title="Experimental">
        <SettingsSection
          title="Flags"
          description="Optional features. Off by default until you turn them on."
          bodyVariant="list"
        >
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-6 w-10 rounded-full" />
          </div>
        </SettingsSection>
      </SettingsPage>
    );
  }

  return (
    <SettingsPage title="Experimental">
      <SettingsSection
        title="Flags"
        description="Optional features. Off by default until you turn them on."
        bodyVariant="list"
      >
        <SettingsToggleRow
          title="Disable page animations"
          description="Skip page and list enters, chart draws, and panel motion. Hover marquees and loading UI stay on."
          action={
            <Switch
              checked={flags.disablePageMotion === true}
              onCheckedChange={(checked) =>
                toggle("disablePageMotion", checked)
              }
              aria-label="Disable page animations"
            />
          }
        />
      </SettingsSection>
    </SettingsPage>
  );
}
