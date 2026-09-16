import { Skeleton } from "@vmem/ui";
import { SettingsPage } from "@/components/settings/SettingsPage";
import { SettingsSection } from "@/components/settings/SettingsSection";

export function PreferencesPageSkeleton() {
  return (
    <SettingsPage title="Preferences">
      <SettingsSection title="About you">
        <div className="grid gap-5">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-24 w-full" />
        </div>
      </SettingsSection>
      {[1, 2, 3].map((section) => (
        <SettingsSection
          key={section}
          title={<Skeleton className="h-4 w-40" />}
        >
          <Skeleton className="h-12 w-full" />
          <Skeleton className="mt-3 h-12 w-full" />
        </SettingsSection>
      ))}
    </SettingsPage>
  );
}
