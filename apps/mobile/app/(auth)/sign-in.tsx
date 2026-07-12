import { useState, useEffect, useCallback } from "react";
import {
  View,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
  Alert,
} from "react-native";
import { useSignIn, useSSO } from "@clerk/clerk-expo";
import { Link, useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import * as AuthSession from "expo-auth-session";
import { IconBrandGoogle } from "@tabler/icons-react-native";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/text";

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
        redirectUrl: AuthSession.makeRedirectUri({
          scheme: "vmem",
          path: "sso-callback",
        }),
      });

      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
        router.replace("/(main)");
      } else {
        console.info("Additional verification required");
      }
    } catch (err) {
      console.error(JSON.stringify(err, null, 2));
      Alert.alert("Error", "Failed to sign in with Google. Please try again.");
    }
  }, [startSSOFlow, router]);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1 bg-surface"
    >
      <ScrollView
        className="flex-1"
        contentContainerClassName="flex-1 justify-center px-6"
        keyboardShouldPersistTaps="handled"
        bounces={false}
      >
        <View className="gap-6">
          <View className="gap-2">
            <Text className="text-3xl font-sans-bold text-foreground">
              Welcome back
            </Text>
            <Text className="text-muted-foreground">
              Sign in to your account
            </Text>
          </View>
          <View className="gap-4">
            <View className="gap-1.5">
              <Text className="text-sm font-sans-medium text-foreground">
                Email
              </Text>
              <Input
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                autoCapitalize="none"
                keyboardType="email-address"
              />
            </View>
            <View className="gap-1.5">
              <Text className="text-sm font-sans-medium text-foreground">
                Password
              </Text>
              <Input
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                secureTextEntry
              />
            </View>
            {error ? (
              <Text className="text-destructive text-sm">{error}</Text>
            ) : null}
            <Button onPress={handleSignIn} disabled={loading}>
              <Text>{loading ? "Signing in..." : "Sign in"}</Text>
            </Button>
          </View>
          <View className="flex-row items-center gap-3">
            <View className="flex-1 h-px bg-border" />
            <Text className="text-muted-foreground text-sm">or</Text>
            <View className="flex-1 h-px bg-border" />
          </View>
          <TouchableOpacity
            onPress={handleGoogleSignIn}
            className="flex-row items-center justify-center gap-3 rounded-lg border border-border bg-surface py-3 px-6"
          >
            <IconBrandGoogle size={20} color="#4285F4" />
            <Text className="text-base font-sans-semibold text-foreground">
              Sign in with Google
            </Text>
          </TouchableOpacity>
          <View className="flex-row justify-center gap-1">
            <Text className="text-muted-foreground">
              Don't have an account?
            </Text>
            <Link href="/(auth)/sign-up">
              <Text className="text-foreground font-sans-semibold">
                Sign up
              </Text>
            </Link>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
