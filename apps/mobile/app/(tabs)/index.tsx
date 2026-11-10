import { IconInbox } from "@tabler/icons-react-native";
import { Button } from "@vvedantb/native-ui/button";
import {
  PageHeader,
  ScreenContainer,
  SectionLabel,
} from "@vvedantb/native-ui/layout";
import { EmptyState } from "@vvedantb/native-ui/primitives";
import { View } from "react-native";
import { trackerActions, useTracker } from "@/sync/store";
import { QueueCard } from "@/ui/QueueCard";
import { RecordingStatus } from "@/ui/RecordingStatus";
import { TabScreen } from "@/ui/TabScreen";

/** The review queue. Nothing leaves the phone before Approve. */
export default function ReviewScreen() {
  const { status, queue, syncing } = useTracker();
  const pending = queue.filter((row) => row.status === "pending_review");
  const sending = queue.filter((row) => row.status === "approved");
  const sent = queue.filter((row) => row.status === "uploaded");

  return (
    <TabScreen>
      <PageHeader
        title="Review"
        action={
          pending.length > 0 ? (
            <Button
              size="sm"
              fullWidth={false}
              onPress={() => void trackerActions.approveAll()}
            >
              {`Approve all (${String(pending.length)})`}
            </Button>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              fullWidth={false}
              loading={syncing}
              onPress={() => void trackerActions.refresh()}
            >
              Check now
            </Button>
          )
        }
      />
      <ScreenContainer reserveTabBar>
        <RecordingStatus status={status} />

        {pending.length === 0 ? (
          <EmptyState
            icon={IconInbox}
            title="Nothing to review"
            description="Shares, notes and clipboard text that you save wait here until you approve them. App use stays on this phone."
          />
        ) : (
          <View className="gap-3">
            <SectionLabel className="px-4">Waiting for review</SectionLabel>
            {pending.map((row) => (
              <QueueCard key={row.id} row={row} />
            ))}
          </View>
        )}

        {sending.length > 0 ? (
          <View className="gap-3">
            <SectionLabel className="px-4">Approved, not sent yet</SectionLabel>
            {sending.map((row) => (
              <QueueCard key={row.id} row={row} />
            ))}
          </View>
        ) : null}

        {sent.length > 0 ? (
          <View className="gap-3">
            <SectionLabel className="px-4">Sent recently</SectionLabel>
            {sent.map((row) => (
              <QueueCard key={row.id} row={row} />
            ))}
          </View>
        ) : null}
      </ScreenContainer>
    </TabScreen>
  );
}
