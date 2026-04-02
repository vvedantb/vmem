import { useCallback, useEffect, useState } from "react";
import { Redirect, Tabs } from "expo-router";
import { View, ActivityIndicator } from "react-native";
import { useAuth, useUser } from "@clerk/clerk-expo";
import { useMutation } from "convex/react";
import { useColorScheme } from "nativewind";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@vmem/backend";
import { useIsOnline } from "@/providers/NetworkProvider";
import { THEME_COLORS } from "@/lib/theme";
import { Text } from "@/components/ui/text";

function OfflineBanner() {
  const isOnline = useIsOnline();
  if (isOnline) return null;

  return (
    <View className="bg-warning/10 px-4 py-2">
      <Text className="text-warning text-xs text-center font-medium">
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
  const { colorScheme } = useColorScheme();

  const theme = colorScheme === "dark" ? THEME_COLORS.dark : THEME_COLORS.light;

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
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" color={theme.primary} />
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
          tabBarActiveTintColor: theme.foreground,
          tabBarInactiveTintColor: theme.muted,
          tabBarStyle: {
            backgroundColor: theme.background,
            borderTopColor: theme.border,
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Chat",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="chatbubble-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: "Settings",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="settings-outline" size={size} color={color} />
            ),
          }}
        />
      </Tabs>
    </>
  );
}
