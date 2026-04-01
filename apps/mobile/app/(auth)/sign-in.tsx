import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
  Alert,
} from "react-native";
import { useSignIn, useSSO } from "@clerk/clerk-expo";
import { Link, useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { AntDesign } from "@expo/vector-icons";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

const useWarmUpBrowser = () => {
  useEffect(() => {
    void WebBrowser.warmUpAsync();
    return () => {
      void WebBrowser.coolDownAsync();
    };
  }, []);
};

WebBrowser.maybeCompleteAuthSession();

export default function SignInScreen() {
  useWarmUpBrowser();

  const { signIn, setActive, isLoaded } = useSignIn();
  const router = useRouter();
  const { startSSOFlow } = useSSO();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSignIn() {
    if (!isLoaded) return;

    if (!email || !password) {
      Alert.alert(
        "Missing Information",
        "Please enter both email and password.",
      );
      return;
    }

    setLoading(true);
    setError("");
    try {
      const result = await signIn.create({
        identifier: email,
        password,
      });
      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        router.replace("/(main)");
      } else {
        Alert.alert(
          "Sign In Incomplete",
          "Please complete additional verification steps.",
        );
      }
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  }

  const handleGoogleSignIn = useCallback(async () => {
    try {
      const { createdSessionId, setActive } = await startSSOFlow({
        strategy: "oauth_google",
        redirectUrl: Linking.createURL("/sso-callback"),
      });

      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
        router.replace("/(main)");
      } else {
        console.log("Additional verification required");
      }
    } catch (err) {
      console.error(JSON.stringify(err, null, 2));
      Alert.alert("Error", "Failed to sign in with Google. Please try again.");
    }
  }, [startSSOFlow, router]);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1 bg-white"
    >
      <ScrollView
        className="flex-1"
        contentContainerClassName="flex-1 justify-center px-6"
        keyboardShouldPersistTaps="handled"
        bounces={false}
      >
        <View className="gap-6">
          <View className="gap-2">
            <Text className="text-3xl font-bold text-gray-900">
              Welcome back
            </Text>
            <Text className="text-gray-500">Sign in to your account</Text>
          </View>
          <View className="gap-4">
            <Input
              label="Email"
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <Input
              label="Password"
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              secureTextEntry
            />
            {error ? (
              <Text className="text-red-500 text-sm">{error}</Text>
            ) : null}
            <Button
              onPress={handleSignIn}
              title={loading ? "Signing in..." : "Sign in"}
              disabled={loading}
            />
          </View>
          <View className="flex-row items-center gap-3">
            <View className="flex-1 h-px bg-gray-200" />
            <Text className="text-gray-400 text-sm">or</Text>
            <View className="flex-1 h-px bg-gray-200" />
          </View>
          <TouchableOpacity
            onPress={handleGoogleSignIn}
            className="flex-row items-center justify-center gap-3 rounded-lg border border-gray-300 bg-white py-3 px-6"
          >
            <AntDesign name="google" size={20} color="#4285F4" />
            <Text className="text-base font-semibold text-black">
              Sign in with Google
            </Text>
          </TouchableOpacity>
          <View className="flex-row justify-center gap-1">
            <Text className="text-gray-500">Don't have an account?</Text>
            <Link href="/(auth)/sign-up">
              <Text className="text-black font-semibold">Sign up</Text>
            </Link>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
