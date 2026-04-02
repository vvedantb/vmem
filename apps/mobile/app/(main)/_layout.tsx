import { useCallback, useEffect, useState } from "react";
import { Redirect, Tabs } from "expo-router";
import { View, Text, ActivityIndicator } from "react-native";
import { useAuth, useUser } from "@clerk/clerk-expo";
import { useMutation } from "convex/react";
import { api } from "@vmem/backend";
import { useIsOnline } from "@/providers/NetworkProvider";

function ChatIcon({ color, size }: { color: string; size: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 2,
        borderColor: color,
      }}
    />
  );
}

function SettingsIcon({ color, size }: { color: string; size: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: 4,
        borderWidth: 2,
        borderColor: color,
      }}
    />
  );
}

function OfflineBanner() {
  const isOnline = useIsOnline();
  if (isOnline) return null;

  return (
    <View className="bg-yellow-50 dark:bg-yellow-900/30 px-4 py-2">
      <Text className="text-yellow-800 dark:text-yellow-200 text-xs text-center font-medium">
        Offline mode — using local AI
      </Text>
    </View>
  );
}

export default function MainLayout() {
  const { isSignedIn } = useAuth({ treatPendingAsSignedOut: false });
  const { user, isLoaded } = useUser();
  const ensureUserExists = useMutation(api.auth.ensureUserExists);
  const [isUserReady, setIsUserReady] = useState(false);

  const ensureUser = useCallback(async () => {
    await ensureUserExists({});
    setIsUserReady(true);
  }, [ensureUserExists]);

  useEffect(() => {
    if (!isLoaded) {
      return;
    }

    if (!user) {
      setIsUserReady(false);
      return;
    }

    setIsUserReady(false);
    void ensureUser().catch((error) => {
      console.error("Failed to ensure user:", error);
    });
  }, [isLoaded, user, ensureUser]);

  if (!isLoaded || (user !== null && !isUserReady)) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" color="#000000" />
      </View>
    );
  }

  if (!isSignedIn) {
    return <Redirect href="/(auth)/sign-in" />;
  }

  return (
    <>
      <OfflineBanner />
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: "#000000",
          tabBarInactiveTintColor: "#9ca3af",
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Chat",
            tabBarIcon: ({ color, size }) => (
              <ChatIcon color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: "Settings",
            tabBarIcon: ({ color, size }) => (
              <SettingsIcon color={color} size={size} />
            ),
          }}
        />
      </Tabs>
    </>
  );
}
