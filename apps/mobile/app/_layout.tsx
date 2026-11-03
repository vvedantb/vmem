import "../global.css";

import { ClerkProvider, useAuth } from "@clerk/clerk-expo";
import { tokenCache } from "@clerk/clerk-expo/token-cache";
import {
  InstrumentSans_400Regular,
  InstrumentSans_500Medium,
  InstrumentSans_600SemiBold,
  InstrumentSans_700Bold,
  useFonts,
} from "@expo-google-fonts/instrument-sans";
import { CenteredSpinner } from "@vvedantb/native-ui/primitives";
import { NativeUiProvider } from "@vvedantb/native-ui/theme";
import { Toaster } from "@vvedantb/native-ui/toast";
import { Slot, ThemeProvider } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as WebBrowser from "expo-web-browser";
import { PUBLISHABLE_KEY } from "@/config";
import { navigationTheme, useScheme } from "@/ui/theme";

// Completes the Google sign-in browser session when the app reopens on the redirect.
WebBrowser.maybeCompleteAuthSession();

function Navigator() {
  const { isLoaded } = useAuth({ treatPendingAsSignedOut: false });
  if (!isLoaded) return <CenteredSpinner label="Loading" />;
  return <Slot />;
}

export default function RootLayout() {
  const scheme = useScheme();
  const [fontsLoaded] = useFonts({
    InstrumentSans_400Regular,
    InstrumentSans_500Medium,
    InstrumentSans_600SemiBold,
    InstrumentSans_700Bold,
  });
  if (!fontsLoaded) return null;

  return (
    <ClerkProvider publishableKey={PUBLISHABLE_KEY} tokenCache={tokenCache}>
      <ThemeProvider value={navigationTheme(scheme)}>
        <NativeUiProvider>
          <Navigator />
          <Toaster />
          <StatusBar style={scheme === "dark" ? "light" : "dark"} />
        </NativeUiProvider>
      </ThemeProvider>
    </ClerkProvider>
  );
}
