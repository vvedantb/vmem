import { useState } from "react";
import { TouchableOpacity, Text, View, Image } from "react-native";
import { useSSO } from "@clerk/clerk-expo";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { useRouter } from "expo-router";

WebBrowser.maybeCompleteAuthSession();

export function GoogleSignInButton({ label = "Continue with Google" }) {
  const { startSSOFlow } = useSSO();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleGoogleSignIn() {
    setLoading(true);
    setError("");
    try {
      const redirectUrl = Linking.createURL("/sso-callback");
      const { createdSessionId, setActive } = await startSSOFlow({
        strategy: "oauth_google",
        redirectUrl,
      });

      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
        router.replace("/(main)");
      }
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <View className="gap-2">
      <TouchableOpacity
        onPress={handleGoogleSignIn}
        disabled={loading}
        className={`flex-row items-center justify-center gap-3 rounded-lg border border-gray-300 bg-white py-3 px-6 ${loading ? "opacity-50" : ""}`}
      >
        <Image
          source={{
            uri: "https://developers.google.com/identity/images/g-logo.png",
          }}
          className="h-5 w-5"
        />
        <Text className="text-base font-semibold text-black">
          {loading ? "Signing in..." : label}
        </Text>
      </TouchableOpacity>
      {error ? <Text className="text-sm text-red-500">{error}</Text> : null}
    </View>
  );
}
