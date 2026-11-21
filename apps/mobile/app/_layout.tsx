import "../global.css";

import { tokenCache } from "@clerk/expo/token-cache";
import {
  InstrumentSans_400Regular,
  InstrumentSans_500Medium,
  InstrumentSans_600SemiBold,
  InstrumentSans_700Bold,
  useFonts,
} from "@expo-google-fonts/instrument-sans";
import { AuthProviders } from "@vvedantb/native-ui/auth";
import { NativeUiProvider } from "@vvedantb/native-ui/theme";
import { Toaster } from "@vvedantb/native-ui/toast";
import { Slot, ThemeProvider } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View } from "react-native";
import { PUBLISHABLE_KEY } from "@/config";
import { convex } from "@/convex/client";
import { EnsureUser } from "@/providers/EnsureUser";
import { restoreThemeMode, useThemeMode } from "@/settings/themeMode";
import { NEUTRAL_CLASS_VARS, navigationTheme, useScheme } from "@/ui/theme";
import { UpdateDialog } from "@/update/UpdateDialog";

// This phone's last appearance mode, applied before the first screen.
void restoreThemeMode();

export default function RootLayout() {
  const scheme = useScheme();
  const mode = useThemeMode();
  const [fontsLoaded] = useFonts({
    InstrumentSans_400Regular,
    InstrumentSans_500Medium,
    InstrumentSans_600SemiBold,
    InstrumentSans_700Bold,
  });
  if (!fontsLoaded) return null;

  return (
    <AuthProviders
      publishableKey={PUBLISHABLE_KEY}
      tokenCache={tokenCache}
      convex={convex}
    >
      <ThemeProvider value={navigationTheme(scheme)}>
        <NativeUiProvider>
          {/* Neutral repaints the class colours: global.css has light and dark only. */}
          <View
            className="flex-1"
            style={mode === "neutral" ? NEUTRAL_CLASS_VARS : undefined}
          >
            <EnsureUser />
            <Slot />
            <UpdateDialog />
            <Toaster />
          </View>
          <StatusBar style={scheme === "dark" ? "light" : "dark"} />
        </NativeUiProvider>
      </ThemeProvider>
    </AuthProviders>
  );
}
