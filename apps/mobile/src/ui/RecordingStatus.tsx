import { Button } from "@vvedantb/native-ui/button";
import { Card, StatusDot, Text } from "@vvedantb/native-ui/primitives";
import { View } from "react-native";
import type { TrackerStatus } from "../../modules/vmem-tracker";
import { trackerActions } from "../sync/store";
import { textColor, useScheme } from "./theme";

/** Why nothing is being recorded, with the one action that fixes it. */
export function RecordingStatus({ status }: { status: TrackerStatus | null }) {
  const scheme = useScheme();
  if (status === null) return null;

  if (status.paused) {
    return (
      <Card
        title="Recording is paused"
        description="Nothing new is recorded. You can still review and send items."
      >
        <Button onPress={() => void trackerActions.setPaused(false)}>
          Resume
        </Button>
      </Card>
    );
  }

  if (!status.usageAccess) {
    return (
      <Card
        title="Allow usage access"
        description="vmem needs Usage Access to see which apps you use and for how long. It does not read what is on the screen."
      >
        <Button onPress={trackerActions.openUsageAccessSettings}>
          Open settings
        </Button>
      </Card>
    );
  }

  return (
    <View className="flex-row items-center gap-2 px-1">
      <StatusDot tone="active" />
      <Text variant="muted" style={textColor(scheme, "muted")}>
        Recording. App use shows here after each hour ends.
      </Text>
    </View>
  );
}
