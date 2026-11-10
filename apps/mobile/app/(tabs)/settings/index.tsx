import { useAuth, useUser } from "@clerk/clerk-expo";
import { Button } from "@vvedantb/native-ui/button";
import {
  MoreFromProjectV,
  PageHeader,
  ScreenContainer,
  SettingsSection,
  SettingsToggleRow,
} from "@vvedantb/native-ui/layout";
import {
  ConfirmDialog,
  ListRow,
  StatGrid,
  Switch,
  Text,
} from "@vvedantb/native-ui/primitives";
import { useRouter } from "expo-router";
import { useState } from "react";
import { trackerActions, useTracker } from "@/sync/store";
import { TabScreen } from "@/ui/TabScreen";
import { textColor, useScheme } from "@/ui/theme";

type Confirm = "delete" | "sign-out" | null;

export default function SettingsScreen() {
  const { status, denyList } = useTracker();
  const { signOut } = useAuth();
  const { user } = useUser();
  const router = useRouter();
  const scheme = useScheme();
  const [confirm, setConfirm] = useState<Confirm>(null);
  const recording = status !== null && !status.paused;
  const counts = status?.counts;

  return (
    <TabScreen>
      <PageHeader title="Settings" />
      <ScreenContainer reserveTabBar>
        <SettingsSection
          title="Recording"
          description="vmem records which apps you use and for how long. That usage stays on this phone. It is never uploaded."
        >
          <SettingsToggleRow
            title="Record app use"
            description={recording ? "On" : "Paused. Nothing new is recorded."}
            action={
              <Switch
                checked={recording}
                disabled={status === null}
                onCheckedChange={(on) => void trackerActions.setPaused(!on)}
                accessibilityLabel="Record app use"
              />
            }
          />
          <SettingsToggleRow
            title="Usage access"
            description={
              status?.usageAccess
                ? "Allowed"
                : "Needed to see which apps you use. vmem does not read the screen."
            }
            action={
              <Button
                size="sm"
                variant="outline"
                fullWidth={false}
                onPress={trackerActions.openUsageAccessSettings}
              >
                Open
              </Button>
            }
          />
          <Text variant="muted" style={textColor(scheme, "muted")}>
            Tip: add the vmem recording tile to Quick Settings to pause from
            anywhere.
          </Text>
        </SettingsSection>

        <SettingsSection
          title="Blocked apps"
          description="Never recorded. Messaging apps are blocked by default."
          bodyVariant="list"
        >
          <ListRow
            title="Edit blocked apps"
            meta={`${String(denyList.length)} apps`}
            onPress={() => router.push("/settings/blocked-apps")}
          />
        </SettingsSection>

        <SettingsSection
          title="Calendar"
          description="Off by default. When on, vmem reads your calendar (read-only) when you open the app. It includes today's meetings. The server writes a summary of the day and of each meeting. Each summary waits in Review until you approve it. Declined events and all-day events without guests are skipped."
        >
          <SettingsToggleRow
            title="Summarise my calendar"
            description={
              status?.calendarEnabled && !status.calendarAccess
                ? "Calendar permission is off. Allow it in Android Settings."
                : status?.calendarEnabled
                  ? "On"
                  : "Off"
            }
            action={
              <Switch
                checked={status?.calendarEnabled ?? false}
                disabled={status === null}
                onCheckedChange={(on) => void trackerActions.setCalendar(on)}
                accessibilityLabel="Summarise my calendar"
              />
            }
          />
        </SettingsSection>

        <SettingsSection
          title="Sharing and Capture"
          description="Share text or a link to vmem from any app, or use the Capture tab for a quick note, a voice note or the clipboard. The clipboard is read only when you tap Save clipboard. Each item waits in Review until you approve it. This works while recording is paused."
        />

        <SettingsSection
          title="On this phone"
          description="Sent items stay here for a week. Unreviewed activity is deleted after 30 days."
        >
          <StatGrid
            columns={3}
            items={[
              { label: "To review", value: String(counts?.pendingReview ?? 0) },
              { label: "Not sent", value: String(counts?.approved ?? 0) },
              { label: "Sent", value: String(counts?.uploaded ?? 0) },
            ]}
          />
          <Button variant="destructive" onPress={() => setConfirm("delete")}>
            Delete all local data
          </Button>
        </SettingsSection>

        <MoreFromProjectV current="vmem" />

        <SettingsSection
          title="Account"
          description={user?.primaryEmailAddress?.emailAddress ?? "Signed in"}
        >
          <Button variant="outline" onPress={() => setConfirm("sign-out")}>
            Sign out
          </Button>
        </SettingsSection>
      </ScreenContainer>

      <ConfirmDialog
        open={confirm === "delete"}
        onOpenChange={(open) => setConfirm(open ? "delete" : null)}
        title="Delete all local data?"
        description="This deletes the review queue, unsent items and recorded activity on this phone. Memories already in vmem stay. Your settings stay."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => void trackerActions.deleteAllLocalData()}
      />
      <ConfirmDialog
        open={confirm === "sign-out"}
        onOpenChange={(open) => setConfirm(open ? "sign-out" : null)}
        title="Sign out?"
        description="Signing out deletes items on this phone that are not sent yet, so another account cannot send them."
        confirmLabel="Sign out"
        variant="destructive"
        onConfirm={() =>
          void trackerActions.deleteAllLocalData().then(() => signOut())
        }
      />
    </TabScreen>
  );
}
