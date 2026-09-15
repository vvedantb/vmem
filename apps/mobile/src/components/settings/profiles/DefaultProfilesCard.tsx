import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import {
  IconBrandChrome,
  IconCheck,
  IconWorld,
} from "@tabler/icons-react-native";
import { useColorScheme } from "nativewind";
import { useMutation, useQuery } from "convex/react";
import { api } from "@vmem/backend";
import type { Doc } from "@vmem/backend";
import BottomSheet from "@/components/ui/BottomSheet";
import { Text } from "@/components/ui/text";
import { THEME_COLORS } from "@/lib/theme";

type DefaultSource = "web" | "extension";

function ColorDot({ color }: { color: string }) {
  return (
    <View
      className="h-2 w-2 shrink-0 rounded-full"
      style={{ backgroundColor: color }}
    />
  );
}

/** Default-profile pickers per source — port of web's DefaultProfilesSection. */
export default function DefaultProfilesCard({
  profiles,
}: {
  profiles: Doc<"profiles">[];
}) {
  const [pickerSource, setPickerSource] = useState<DefaultSource | null>(null);
  const { colorScheme } = useColorScheme();
  const theme = colorScheme === "dark" ? THEME_COLORS.dark : THEME_COLORS.light;

  const settings = useQuery(api.userSettings.get);
  const setDefaultProfile = useMutation(
    api.userSettings.setDefaultProfile,
  ).withOptimisticUpdate((localStore, args) => {
    const current = localStore.getQuery(api.userSettings.get, {});
    if (!current) return;
    const defaults = current.defaultProfiles ?? {};
    localStore.setQuery(
      api.userSettings.get,
      {},
      {
        ...current,
        defaultProfiles: { ...defaults, [args.source]: args.profileId },
      },
    );
  });

  const defaultProfile = profiles.find((p) => p.isDefault);
  const webDefault =
    profiles.find((p) => p._id === settings?.defaultProfiles?.web) ??
    defaultProfile;
  const extensionDefault =
    profiles.find((p) => p._id === settings?.defaultProfiles?.extension) ??
    defaultProfile;

  const currentForPicker =
    pickerSource === "web" ? webDefault : extensionDefault;

  const handlePick = async (profile: Doc<"profiles">) => {
    if (!pickerSource) return;
    setPickerSource(null);
    try {
      await setDefaultProfile({ source: pickerSource, profileId: profile._id });
    } catch (err) {
      console.error("Failed to set default profile:", err);
    }
  };

  const renderRow = (
    source: DefaultSource,
    label: string,
    Icon: typeof IconWorld,
    selected: Doc<"profiles"> | undefined,
  ) => (
    <View className="flex-row items-center justify-between gap-4">
      <View className="flex-row items-center gap-2">
        <Icon size={16} color={theme.muted} />
        <Text className="text-sm text-foreground">{label}</Text>
      </View>
      <Pressable
        onPress={() => setPickerSource(source)}
        className="flex-row items-center gap-2 rounded-lg bg-surface-secondary px-3 py-1.5 active:bg-surface-tertiary"
        style={{ maxWidth: 170 }}
      >
        {selected && <ColorDot color={selected.color} />}
        <Text className="text-sm text-foreground" numberOfLines={1}>
          {selected?.name ?? "Select"}
        </Text>
      </Pressable>
    </View>
  );

  return (
    <View className="gap-3 rounded-xl bg-card p-4">
      {renderRow("web", "Web App", IconWorld, webDefault)}
      {renderRow(
        "extension",
        "Browser Extension",
        IconBrandChrome,
        extensionDefault,
      )}
      <Text className="pt-1 text-xs text-muted-foreground">
        MCP clients will ask which profile to save to
      </Text>

      <BottomSheet
        visible={pickerSource !== null}
        onClose={() => setPickerSource(null)}
        title={
          pickerSource === "web"
            ? "Default profile — Web App"
            : "Default profile — Browser Extension"
        }
      >
        <ScrollView className="px-3 pb-3">
          {profiles.map((profile) => (
            <Pressable
              key={profile._id}
              onPress={() => void handlePick(profile)}
              className="flex-row items-center gap-3 rounded-xl px-3 py-3 active:bg-surface-tertiary"
            >
              <ColorDot color={profile.color} />
              <Text className="flex-1 text-sm text-overlay-foreground">
                {profile.name}
              </Text>
              {currentForPicker?._id === profile._id && (
                <IconCheck size={16} color={theme.foreground} />
              )}
            </Pressable>
          ))}
        </ScrollView>
      </BottomSheet>
    </View>
  );
}
