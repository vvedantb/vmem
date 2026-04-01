import { useState } from "react";
import { View, Text, KeyboardAvoidingView, Platform } from "react-native";
import { useSignUp } from "@clerk/clerk-expo";
import { Link, useRouter } from "expo-router";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { GoogleSignInButton } from "@/components/ui/GoogleSignInButton";

export default function RegisterScreen() {
  const { signUp, setActive, isLoaded } = useSignUp();
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSignUp() {
    if (!isLoaded) return;
    setLoading(true);
    setError("");
    try {
      const parts = name.trim().split(/\s+/).filter(Boolean);
      const firstName = parts[0] ?? "";
      const lastName = parts.slice(1).join(" ") || undefined;

      const result = await signUp.create({
        firstName,
        lastName,
        emailAddress: email,
        password,
      });
      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
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
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1 bg-white"
    >
      <View className="flex-1 justify-center px-6 gap-6">
        <View className="gap-2">
          <Text className="text-3xl font-bold text-gray-900">
            Create account
          </Text>
          <Text className="text-gray-500">Sign up to get started</Text>
        </View>
        <View className="gap-4">
          <Input
            label="Name"
            value={name}
            onChangeText={setName}
            placeholder="John Doe"
          />
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
          {error ? <Text className="text-red-500 text-sm">{error}</Text> : null}
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
        <GoogleSignInButton label="Sign up with Google" />
        <View className="flex-row justify-center gap-1">
          <Text className="text-gray-500">Already have an account?</Text>
          <Link href="/(auth)/login">
            <Text className="text-black font-semibold">Sign in</Text>
          </Link>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
