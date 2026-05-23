import { ExpoConfig, ConfigContext } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => ({
  name: "vmem",
  slug: "vmem-mobile",
  version: "1.0.0",
  orientation: "portrait",
  scheme: "vmem",
  icon: "./assets/icon.png",
  userInterfaceStyle: "automatic",
  platforms: ["ios", "android"],
  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.vis1.vmem",
  },
  android: {
    package: "com.vis1.vmem",
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#000000",
    },
  },
  plugins: [
    "expo-router",
    "expo-font",
    [
      "expo-splash-screen",
      {
        image: "./assets/icon.png",
        resizeMode: "contain",
        backgroundColor: "#000000",
      },
    ],
    "expo-status-bar",
    "expo-web-browser",
    [
      "expo-secure-store",
      {
        faceIDPermission: "Allow vmem to access your Face ID biometric data.",
      },
    ],
    [
      "expo-speech-recognition",
      {
        microphonePermission:
          "Allow vmem to use the microphone for voice input.",
        speechRecognitionPermission:
          "Allow vmem to use speech recognition for voice input.",
      },
    ],
  ],
  experiments: {
    typedRoutes: false,
    reactCompiler: true,
  },
});
