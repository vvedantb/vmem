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
import { useSignUp, useSSO } from "@clerk/clerk-expo";
import { Link, useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import * as AuthSession from "expo-auth-session";
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

export default function SignUpScreen() {
  useWarmUpBrowser();

  const { signUp, setActive, isLoaded } = useSignUp();
  const router = useRouter();
  const { startSSOFlow } = useSSO();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingVerification, setPendingVerification] = useState(false);
  const [code, setCode] = useState("");

  async function handleSignUp() {
    if (!isLoaded) return;

    if (!email || !password) {
      Alert.alert(
        "Missing Information",
        "Please enter both email and password.",
      );
      return;
    }

    if (password.length < 8) {
      Alert.alert(
        "Weak Password",
        "Password must be at least 8 characters long.",
      );
      return;
    }

    setLoading(true);
    setError("");
    try {
      await signUp.create({
        emailAddress: email,
        password,
      });
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setPendingVerification(true);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify() {
    if (!isLoaded) return;

    if (!code || code.length < 4) {
      Alert.alert(
        "Invalid Code",
        "Please enter the complete verification code.",
      );
      return;
    }

    setLoading(true);
    setError("");
    try {
      const result = await signUp.attemptEmailAddressVerification({ code });
      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        router.replace("/(main)");
      } else {
        Alert.alert(
          "Verification Incomplete",
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

  const handleGoogleSignUp = useCallback(async () => {
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
        console.log("Additional verification required");
      }
    } catch (err) {
      console.error(JSON.stringify(err, null, 2));
      Alert.alert("Error", "Failed to sign up with Google. Please try again.");
    }
  }, [startSSOFlow, router]);

  if (pendingVerification) {
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
                Check your email
              </Text>
              <Text className="text-gray-500">
                Enter the verification code sent to your email
              </Text>
            </View>
            <View className="gap-4">
              <Input
                label="Verification code"
                value={code}
                onChangeText={setCode}
                placeholder="Enter code"
                keyboardType="number-pad"
              />
              {error ? (
                <Text className="text-red-500 text-sm">{error}</Text>
              ) : null}
              <Button
                onPress={handleVerify}
                title={loading ? "Verifying..." : "Verify"}
                disabled={loading}
              />
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

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
              Create account
            </Text>
            <Text className="text-gray-500">Sign up to get started</Text>
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
              onPress={handleSignUp}
              title={loading ? "Creating account..." : "Create account"}
              disabled={loading}
            />
          </View>
          <View className="flex-row items-center gap-3">
            <View className="flex-1 h-px bg-gray-200" />
            <Text className="text-gray-400 text-sm">or</Text>
            <View className="flex-1 h-px bg-gray-200" />
          </View>
          <TouchableOpacity
            onPress={handleGoogleSignUp}
            className="flex-row items-center justify-center gap-3 rounded-lg border border-gray-300 bg-white py-3 px-6"
          >
            <AntDesign name="google" size={20} color="#4285F4" />
            <Text className="text-base font-semibold text-black">
              Sign up with Google
            </Text>
          </TouchableOpacity>
          <View className="flex-row justify-center gap-1">
            <Text className="text-gray-500">Already have an account?</Text>
            <Link href="/(auth)/sign-in">
              <Text className="text-black font-semibold">Sign in</Text>
            </Link>
          </View>
          <View nativeID="clerk-captcha" />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
