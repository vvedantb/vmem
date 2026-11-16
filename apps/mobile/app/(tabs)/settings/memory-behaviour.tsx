import { api } from "@vmem/backend";
import {
  CONFIDENCE_THRESHOLD_MAX,
  CONFIDENCE_THRESHOLD_MIN,
} from "@vmem/shared";
import {
  ScreenContainer,
  SettingsField,
  SettingsSection,
  SettingsToggleRow,
  StackPageHeader,
} from "@vvedantb/native-ui/layout";
import { Select, Skeleton, Switch } from "@vvedantb/native-ui/primitives";
import { useQuery } from "convex/react";
import { useRouter } from "expo-router";
import { View } from "react-native";
import { useSaveSettings } from "@/settings/use-save-settings";
import { TabScreen } from "@/ui/TabScreen";

/** native-ui has no slider. A select in 5% steps matches the web slider step. */
const THRESHOLD_STEP = 5;
const THRESHOLD_OPTIONS = Array.from(
  {
    length:
      (CONFIDENCE_THRESHOLD_MAX - CONFIDENCE_THRESHOLD_MIN) / THRESHOLD_STEP +
      1,
  },
  (_, index) => {
    const value = CONFIDENCE_THRESHOLD_MIN + index * THRESHOLD_STEP;
    return { label: `${String(value)}%`, value };
  },
);

export default function MemoryBehaviourScreen() {
  const settings = useQuery(api.userSettings.get);
  const save = useSaveSettings();
  const router = useRouter();

  return (
    <TabScreen>
      <StackPageHeader title="Memory behaviour" onBack={router.back} />
      <ScreenContainer reserveTabBar>
        {settings === undefined ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <SettingsSection
            title="Extraction"
            description="What gets extracted from conversations, and how confident it has to be."
          >
            <View className="gap-5">
              <SettingsToggleRow
                className="px-0"
                title="Auto-extract memories"
                description="Automatically extract memories from conversations."
                action={
                  <Switch
                    checked={settings.memoryAutoExtract}
                    onCheckedChange={(on) =>
                      void save({ memoryAutoExtract: on })
                    }
                    accessibilityLabel="Auto-extract memories"
                  />
                }
              />
              <SettingsField
                label="Confidence threshold"
                description="Only extract memories with confidence above this threshold."
              >
                <Select
                  value={settings.memoryConfidenceThreshold}
                  options={THRESHOLD_OPTIONS}
                  onValueChange={(value) =>
                    void save({ memoryConfidenceThreshold: value })
                  }
                  accessibilityLabel="Confidence threshold"
                />
              </SettingsField>
            </View>
          </SettingsSection>
        )}
      </ScreenContainer>
    </TabScreen>
  );
}
