import { api } from "@vmem/backend";
import { formatRelativeTime } from "@vmem/shared";
import {
  ScreenContainer,
  SettingsSection,
  SettingsToggleRow,
  StackPageHeader,
} from "@vvedantb/native-ui/layout";
import { Skeleton, Switch, Text } from "@vvedantb/native-ui/primitives";
import { useQuery } from "convex/react";
import { useRouter } from "expo-router";
import { useSaveSettings } from "@/settings/use-save-settings";
import { TabScreen } from "@/ui/TabScreen";
import { textColor, useScheme } from "@/ui/theme";

/** Same four switches and wording as web Settings > Preferences > Dream Mode. */
export default function DreamModeScreen() {
  const settings = useQuery(api.userSettings.get);
  const save = useSaveSettings();
  const router = useRouter();
  const scheme = useScheme();

  return (
    <TabScreen>
      <StackPageHeader title="Dream Mode" onBack={router.back} />
      <ScreenContainer reserveTabBar>
        {settings === undefined ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          <SettingsSection
            title="Nightly clean-up"
            description="How vmem cleans up and consolidates memories each night."
            bodyVariant="list"
          >
            <SettingsToggleRow
              title="Nightly dreaming"
              description="Every night, merge duplicate memories and expire the ones past their end date. Each change can be undone for 30 days."
              action={
                <Switch
                  checked={settings.dreamModeAutomatic}
                  onCheckedChange={(on) =>
                    void save({ dreamModeAutomatic: on })
                  }
                  accessibilityLabel="Nightly dreaming"
                />
              }
            />
            <SettingsToggleRow
              title="Archive stale browsing history"
              description="Hide browsing history, bookmarks and desktop captures you have not visited for 30 days, opened at most twice and no AI has used."
              action={
                <Switch
                  checked={settings.dreamModeDecay}
                  onCheckedChange={(on) => void save({ dreamModeDecay: on })}
                  accessibilityLabel="Archive stale browsing history"
                />
              }
            />
            <SettingsToggleRow
              title="Use AI for near-duplicates and contradictions"
              description="Ask an AI judge about memories that look alike or disagree. Off: only exact and same-page duplicates merge."
              action={
                <Switch
                  checked={settings.dreamModeUseAi}
                  onCheckedChange={(on) => void save({ dreamModeUseAi: on })}
                  accessibilityLabel="Use AI for near-duplicates and contradictions"
                />
              }
            />
            <SettingsToggleRow
              title="Auto-apply AI-judged merges"
              description="Apply merges and updates the AI judge is sure about at once, with undo for 30 days. Off: they wait in Dreaming > Proposals on the web app. Contradictions always wait there."
              action={
                <Switch
                  checked={settings.dreamModeAutoAccept}
                  onCheckedChange={(on) =>
                    void save({ dreamModeAutoAccept: on })
                  }
                  accessibilityLabel="Auto-apply AI-judged merges"
                />
              }
            />
            <Text
              variant="muted"
              className="px-4 py-3"
              style={textColor(scheme, "muted")}
            >
              Last dreamt: {formatRelativeTime(settings.lastDreamRunAt)}
            </Text>
          </SettingsSection>
        )}
      </ScreenContainer>
    </TabScreen>
  );
}
