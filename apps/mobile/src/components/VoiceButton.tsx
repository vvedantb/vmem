import { useCallback, useEffect, useRef } from "react";
import { View, Pressable, Animated } from "react-native";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";
import { IconMicrophone, IconSquare } from "@tabler/icons-react-native";
import { useColorScheme } from "nativewind";
import { THEME_COLORS } from "@/lib/theme";

type VoiceState = "idle" | "listening";

interface VoiceButtonProps {
  onTranscriptionChange: (text: string) => void;
  state: VoiceState;
  onStateChange: (state: VoiceState) => void;
}

function PingRing({ delay }: { delay: number }) {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const timeout = setTimeout(() => {
      const animation = Animated.loop(
        Animated.parallel([
          Animated.sequence([
            Animated.timing(scale, {
              toValue: 1.8,
              duration: 1500,
              useNativeDriver: true,
            }),
            Animated.timing(scale, {
              toValue: 1,
              duration: 0,
              useNativeDriver: true,
            }),
          ]),
          Animated.sequence([
            Animated.timing(opacity, {
              toValue: 0,
              duration: 1500,
              useNativeDriver: true,
            }),
            Animated.timing(opacity, {
              toValue: 0.3,
              duration: 0,
              useNativeDriver: true,
            }),
          ]),
        ]),
      );
      animation.start();
      return () => animation.stop();
    }, delay);
    return () => clearTimeout(timeout);
  }, [scale, opacity, delay]);

  return (
    <Animated.View
      style={{
        position: "absolute",
        width: 28,
        height: 28,
        borderRadius: 6,
        backgroundColor: "rgba(239, 68, 68, 0.15)",
        transform: [{ scale }],
        opacity,
      }}
    />
  );
}

export default function VoiceButton({
  onTranscriptionChange,
  state,
  onStateChange,
}: VoiceButtonProps) {
  const { colorScheme } = useColorScheme();
  const theme = colorScheme === "dark" ? THEME_COLORS.dark : THEME_COLORS.light;

  useSpeechRecognitionEvent("result", (event) => {
    const lastResult = event.results[event.results.length - 1];
    if (event.isFinal && lastResult?.transcript) {
      onTranscriptionChange(lastResult.transcript);
    }
  });

  useSpeechRecognitionEvent("end", () => {
    onStateChange("idle");
  });

  useSpeechRecognitionEvent("error", () => {
    onStateChange("idle");
  });

  const handlePress = useCallback(async () => {
    if (state === "listening") {
      ExpoSpeechRecognitionModule.stop();
      return;
    }

    const result = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!result.granted) return;

    ExpoSpeechRecognitionModule.start({
      lang: "en-US",
      interimResults: false,
      continuous: false,
    });
    onStateChange("listening");
  }, [state, onStateChange]);

  const isListening = state === "listening";

  return (
    <View className="relative items-center justify-center">
      {isListening && (
        <>
          <PingRing delay={0} />
          <PingRing delay={300} />
          <PingRing delay={600} />
        </>
      )}
      <Pressable
        onPress={handlePress}
        className={`w-7 h-7 rounded-md items-center justify-center ${
          isListening ? "bg-destructive" : ""
        }`}
      >
        {isListening ? (
          <IconSquare size={14} color="#fff" />
        ) : (
          <IconMicrophone size={14} color={theme.muted} />
        )}
      </Pressable>
    </View>
  );
}
