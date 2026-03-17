import { useState, useEffect, useCallback } from "react";
import { View, ActivityIndicator } from "react-native";
import { useMutation } from "convex/react";
import { useAuth } from "@clerk/clerk-expo";
import { api } from "@vmem/backend";

export function EnsureUser({ children }: { children: React.ReactNode }) {
  const { isSignedIn, isLoaded } = useAuth();
  const ensureUserExists = useMutation(api.auth.ensureUserExists);
  const [ready, setReady] = useState(false);

  const ensure = useCallback(async () => {
    await ensureUserExists({});
    setReady(true);
  }, [ensureUserExists]);

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      ensure();
    }
  }, [isLoaded, isSignedIn, ensure]);

  if (!isLoaded || !isSignedIn || !ready) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" color="#000000" />
      </View>
    );
  }

  return <>{children}</>;
}
