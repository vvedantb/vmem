import { ActivityIndicator, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useMutation, useQuery } from "convex/react";
import { api } from "@vmem/backend";
import { DEFAULT_LOCAL_TIME, localTimeToUtc } from "@vmem/shared";
import AboutMeCard from "@/components/settings/preferences/AboutMeCard";
import DreamModeCard from "@/components/settings/preferences/DreamModeCard";
import MemoryBehaviorCard from "@/components/settings/preferences/MemoryBehaviorCard";
import NotificationsCard from "@/components/settings/preferences/NotificationsCard";
import SettingsHeader from "@/components/settings/SettingsHeader";
import { Text } from "@/components/ui/text";

function SectionTitle({ children }: { children: string }) {
  return (
    <Text className="mb-2 mt-6 text-base font-sans-medium text-foreground">
      {children}
    </Text>
  );
}

/** Port of web /settings/preferences — inputs bind to the live query + optimistic updates. */
export default function PreferencesScreen() {
  const settings = useQuery(api.userSettings.get);
  // Optimistic update patches the local query cache so the controlled
  // inputs stay in sync with keystrokes without waiting for the server.
  const updateSettings = useMutation(
    api.userSettings.update,
  ).withOptimisticUpdate((localStore, args) => {
    const current = localStore.getQuery(api.userSettings.get, {});
    if (!current) return;
    localStore.setQuery(api.userSettings.get, {}, { ...current, ...args });
  });
  const setDreamSchedule = useMutation(
    api.dreamSchedule.setDreamSchedule,
  ).withOptimisticUpdate((localStore, args) => {
    const current = localStore.getQuery(api.userSettings.get, {});
    if (!current) return;
    localStore.setQuery(
      api.userSettings.get,
      {},
      {
        ...current,
        dreamModeScheduleEnabled: args.enabled,
        dreamModeScheduleTime: args.enabled ? (args.time ?? null) : null,
      },
    );
  });

  const handleScheduleToggle = async (enabled: boolean): Promise<void> => {
    if (settings === undefined) return;
    try {
      if (!enabled) {
        await setDreamSchedule({ enabled: false });
        return;
      }
      const savedTime = settings.dreamModeScheduleTime;
      const utcTime = savedTime ?? localTimeToUtc(DEFAULT_LOCAL_TIME);
      if (utcTime === null) throw new Error("Invalid default time");
      await setDreamSchedule({ enabled: true, time: utcTime });
    } catch (err) {
      console.error("Failed to update schedule:", err);
    }
  };

  const handleScheduleTimeChange = async (localTime: string): Promise<void> => {
    if (settings === undefined) return;
    const utcTime = localTimeToUtc(localTime);
    if (utcTime === null) return;
    try {
      // Persist the new time even when the schedule is off, so flipping the
      // toggle on later picks up the user's chosen time (web parity).
      await setDreamSchedule({
        enabled: settings.dreamModeScheduleEnabled,
        time: utcTime,
      });
    } catch (err) {
      console.error("Failed to update schedule time:", err);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-surface">
      <SettingsHeader title="Preferences" variant="back" />
      {settings === undefined ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      ) : (
        <ScrollView
          className="flex-1 px-4"
          contentContainerStyle={{ paddingBottom: 32 }}
        >
          <AboutMeCard
            aboutMe={settings.aboutMe}
            preferences={settings.preferences}
            onChangeAboutMe={(text) => void updateSettings({ aboutMe: text })}
            onChangePreferences={(text) =>
              void updateSettings({ preferences: text })
            }
          />

          <SectionTitle>Memory Behavior</SectionTitle>
          <MemoryBehaviorCard
            memoryAutoExtract={settings.memoryAutoExtract}
            memoryConfidenceThreshold={settings.memoryConfidenceThreshold}
            onToggleAutoExtract={(value) =>
              void updateSettings({ memoryAutoExtract: value })
            }
            onCommitConfidenceThreshold={(value) =>
              void updateSettings({ memoryConfidenceThreshold: value })
            }
          />

          <SectionTitle>Dream Mode</SectionTitle>
          <DreamModeCard
            dreamModeAutoAccept={settings.dreamModeAutoAccept}
            dreamModeScheduleEnabled={settings.dreamModeScheduleEnabled}
            dreamModeScheduleTime={settings.dreamModeScheduleTime}
            onToggleAutoAccept={(value) =>
              void updateSettings({ dreamModeAutoAccept: value })
            }
            onToggleSchedule={(enabled) => void handleScheduleToggle(enabled)}
            onChangeScheduleTime={(localTime) =>
              void handleScheduleTimeChange(localTime)
            }
          />

          <SectionTitle>Notification Preferences</SectionTitle>
          <NotificationsCard
            notifyMemoryConflicts={settings.notifyMemoryConflicts}
            notifyNewMemories={settings.notifyNewMemories}
            notifyMemoriesExpiring={settings.notifyMemoriesExpiring}
            onToggle={(field, value) => void updateSettings({ [field]: value })}
          />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
