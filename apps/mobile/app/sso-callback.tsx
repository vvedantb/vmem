import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@clerk/clerk-expo";

export default function SsoCallbackScreen() {
  const { isLoaded, isSignedIn } = useAuth({
    treatPendingAsSignedOut: false,
  });
  const router = useRouter();

  useEffect(() => {
    if (!isLoaded) {
      return;
    }

    if (isSignedIn) {
      router.replace("/(main)");
      return;
    }

    const timeoutId = setTimeout(() => {
      router.replace("/(auth)/sign-in");
    }, 3000);

    return () => clearTimeout(timeoutId);
  }, [isLoaded, isSignedIn, router]);

  return (
    <View className="flex-1 items-center justify-center bg-white">
      <ActivityIndicator size="large" color="#000000" />
    </View>
  );
}
