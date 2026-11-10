import { api } from "@vmem/backend";
import { SETTINGS_TEXT_MAX_LENGTH } from "@vmem/shared";
import { Button } from "@vvedantb/native-ui/button";
import {
  ScreenContainer,
  SettingsField,
  SettingsSection,
  StackPageHeader,
} from "@vvedantb/native-ui/layout";
import { Skeleton, Text, Textarea } from "@vvedantb/native-ui/primitives";
import { useQuery } from "convex/react";
import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { useSaveSettings } from "@/settings/use-save-settings";
import { TabScreen } from "@/ui/TabScreen";
import { textColor, useScheme } from "@/ui/theme";

type Fields = { aboutMe: string; preferences: string };

/** Edits drafts of both texts. The form mounts after the settings load. */
function AboutMeForm({ initial }: { initial: Fields }) {
  const [draft, setDraft] = useState<Fields>(initial);
  const [saving, setSaving] = useState(false);
  const save = useSaveSettings();
  const scheme = useScheme();
  const dirty =
    draft.aboutMe !== initial.aboutMe ||
    draft.preferences !== initial.preferences;

  const submit = async () => {
    setSaving(true);
    await save(draft);
    setSaving(false);
  };

  return (
    <SettingsSection
      title="About you"
      description="How vmem should talk about you and how you like AI to communicate."
      footer={
        <Button
          size="sm"
          fullWidth={false}
          disabled={!dirty}
          loading={saving}
          onPress={() => void submit()}
        >
          Save
        </Button>
      }
    >
      <View className="gap-5">
        <SettingsField label="About me">
          <Textarea
            value={draft.aboutMe}
            onChangeText={(aboutMe) => setDraft({ ...draft, aboutMe })}
            placeholder="A few lines on who you are, what you do, and what you're working toward."
            maxLength={SETTINGS_TEXT_MAX_LENGTH}
            accessibilityLabel="About me"
          />
          <Text variant="muted" style={textColor(scheme, "muted")}>
            {String(draft.aboutMe.length)}/{String(SETTINGS_TEXT_MAX_LENGTH)}
          </Text>
        </SettingsField>
        <SettingsField label="Preferences">
          <Textarea
            value={draft.preferences}
            onChangeText={(preferences) => setDraft({ ...draft, preferences })}
            placeholder="How do you like AI to communicate with you? Tone, depth, formatting, things to avoid."
            maxLength={SETTINGS_TEXT_MAX_LENGTH}
            accessibilityLabel="Preferences"
          />
          <Text variant="muted" style={textColor(scheme, "muted")}>
            {String(draft.preferences.length)}/
            {String(SETTINGS_TEXT_MAX_LENGTH)}
          </Text>
        </SettingsField>
      </View>
    </SettingsSection>
  );
}

export default function AboutMeScreen() {
  const settings = useQuery(api.userSettings.get);
  const router = useRouter();

  return (
    <TabScreen>
      <StackPageHeader title="About me" onBack={router.back} />
      <ScreenContainer reserveTabBar>
        {settings === undefined ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <AboutMeForm
            initial={{
              aboutMe: settings.aboutMe,
              preferences: settings.preferences,
            }}
          />
        )}
      </ScreenContainer>
    </TabScreen>
  );
}
