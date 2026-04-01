import "../src/global.css";

import { View, ActivityIndicator } from "react-native";
import { ClerkProvider, useAuth } from "@clerk/clerk-expo";
import { tokenCache } from "@clerk/clerk-expo/token-cache";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { Slot } from "expo-router";
import { NetworkProvider } from "@/providers/NetworkProvider";

const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL;
if (!convexUrl) {
  throw new Error("Missing EXPO_PUBLIC_CONVEX_URL environment variable");
}

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
if (!publishableKey) {
  throw new Error(
    "Missing EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY environment variable",
  );
}

const convex = new ConvexReactClient(convexUrl);

function RootLayoutNav() {
  const { isLoaded } = useAuth();

  if (!isLoaded) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" color="#000000" />
      </View>
    );
  }

  return <Slot />;
}

export default function RootLayout() {
  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        <NetworkProvider>
          <RootLayoutNav />
        </NetworkProvider>
      </ConvexProviderWithClerk>
    </ClerkProvider>
  );
}
