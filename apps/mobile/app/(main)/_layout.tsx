import { useCallback, useEffect, useState } from "react";
import { Redirect } from "expo-router";
import { Drawer } from "expo-router/drawer";
import { View, ActivityIndicator, Dimensions } from "react-native";
import { useAuth, useUser } from "@clerk/clerk-expo";
import { useMutation } from "convex/react";
import { useColorScheme } from "nativewind";
import { api } from "@vmem/backend";
import { useIsOnline } from "@/providers/NetworkProvider";
import { THEME_COLORS } from "@/lib/theme";
import { Text } from "@/components/ui/text";
import DrawerContent from "@/components/DrawerContent";

function OfflineBanner() {
  const isOnline = useIsOnline();
  if (isOnline) return null;

  return (
    <View className="bg-warning/10 px-4 py-2">
      <Text className="text-warning text-xs text-center font-sans-medium">
        Offline mode — using local AI
      </Text>
    </View>
  );
}

const SCREEN_WIDTH = Dimensions.get("window").width;

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
      <Drawer
        drawerContent={(props) => <DrawerContent {...props} />}
        screenOptions={{
          headerShown: false,
          drawerType: "front",
          swipeEnabled: true,
          swipeEdgeWidth: SCREEN_WIDTH * 0.15,
          swipeMinDistance: 10,
          drawerStyle: {
            backgroundColor: theme.background,
            width: 280,
          },
          overlayColor: "rgba(0,0,0,0.4)",
        }}
      >
        <Drawer.Screen name="index" />
        <Drawer.Screen name="record" />
        <Drawer.Screen name="settings" />
      </Drawer>
    </>
  );
}
