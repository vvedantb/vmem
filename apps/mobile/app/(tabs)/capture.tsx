import { Button } from "@vvedantb/native-ui/button";
import {
  PageHeader,
  ScreenContainer,
  SettingsSection,
} from "@vvedantb/native-ui/layout";
import { Text, Textarea } from "@vvedantb/native-ui/primitives";
import { toast } from "@vvedantb/native-ui/toast";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from "expo-audio";
import { useState } from "react";
import { trackerActions } from "@/sync/store";
import { TabScreen } from "@/ui/TabScreen";
import { textColor, useScheme } from "@/ui/theme";

type VoiceState = "idle" | "recording" | "transcribing";

/** Quick note, voice note and clipboard. Each one lands in Review first. */
export default function CaptureScreen() {
  const scheme = useScheme();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [note, setNote] = useState("");
  const [voice, setVoice] = useState<VoiceState>("idle");

  async function startRecording() {
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) {
      toast.error("Microphone access is off", {
        description: "Allow it in Android settings to record a voice note.",
      });
      return;
    }
    await setAudioModeAsync({ allowsRecording: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    setVoice("recording");
  }

  async function stopRecording() {
    setVoice("transcribing");
    await recorder.stop();
    await setAudioModeAsync({ allowsRecording: false });
    const uri = recorder.uri;
    const text = uri ? await trackerActions.transcribeVoice(uri) : null;
    if (text) setNote((current) => (current ? `${current}\n${text}` : text));
    setVoice("idle");
  }

  function toggleRecording() {
    const run = voice === "recording" ? stopRecording : startRecording;
    run().catch(() => {
      setVoice("idle");
      toast.error("Recording failed");
    });
  }

  return (
    <TabScreen>
      <PageHeader title="Capture" />
      <ScreenContainer reserveTabBar>
        <SettingsSection
          title="Quick note"
          description="Type or dictate. The note waits in Review until you approve it."
        >
          <Textarea
            value={note}
            onChangeText={setNote}
            placeholder="What do you want vmem to remember?"
            accessibilityLabel="Quick note"
          />
          <Button
            variant="outline"
            loading={voice === "transcribing"}
            disabled={voice === "transcribing"}
            icon={voice === "recording" ? "stop" : "mic"}
            onPress={toggleRecording}
          >
            {voice === "recording"
              ? "Stop and transcribe"
              : "Record voice note"}
          </Button>
          <Text variant="muted" style={textColor(scheme, "muted")}>
            Voice is recorded only while you record. The audio goes to vmem to
            become text. vmem does not keep it.
          </Text>
          <Button
            disabled={note.trim().length === 0 || voice !== "idle"}
            onPress={() => {
              void trackerActions.saveNote(note);
              setNote("");
            }}
          >
            Save note
          </Button>
        </SettingsSection>

        <SettingsSection
          title="Clipboard"
          description="vmem reads the clipboard only when you tap Save clipboard. Keys, tokens and one-time codes are removed first."
        >
          <Button
            variant="outline"
            onPress={() => void trackerActions.saveClipboard()}
          >
            Save clipboard
          </Button>
        </SettingsSection>
      </ScreenContainer>
    </TabScreen>
  );
}
