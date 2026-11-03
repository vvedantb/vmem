import { useSignIn } from "@clerk/clerk-expo";
import { GoogleMark } from "@vvedantb/native-ui/brand";
import { Button } from "@vvedantb/native-ui/button";
import { Input, Label, Text } from "@vvedantb/native-ui/primitives";
import { Link, useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { toError } from "@/errors";
import {
  AuthPage,
  authErrorMessage,
  FieldError,
  OrDivider,
  useGoogleSignIn,
} from "@/ui/auth";
import { textColor, useScheme } from "@/ui/theme";

/** Email and password, or Google, as in the archived vmem app. */
export default function SignInScreen() {
  const { signIn, setActive, isLoaded } = useSignIn();
  const router = useRouter();
  const scheme = useScheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const signInWithGoogle = useGoogleSignIn(setError);

  async function handleSignIn() {
    if (!isLoaded) return;
    if (!email || !password) {
      setError("Enter your email and password.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const result = await signIn.create({ identifier: email, password });
      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        router.replace("/");
      } else {
        setError(
          "This account needs another sign-in step. Use vmem on the web to finish it.",
        );
      }
    } catch (caught) {
      setError(authErrorMessage(toError(caught)));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthPage title="Welcome back" description="Sign in to your account">
      <View className="gap-4">
        <View className="gap-1.5">
          <Label>Email</Label>
          <Input
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
          />
        </View>
        <View className="gap-1.5">
          <Label>Password</Label>
          <Input
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            autoComplete="password"
            secureTextEntry
          />
        </View>
        <FieldError message={error} />
        <Button onPress={() => void handleSignIn()} loading={loading}>
          {loading ? "Signing in..." : "Sign in"}
        </Button>
      </View>
      <OrDivider />
      <Button
        variant="outline"
        leftIcon={<GoogleMark />}
        onPress={() => void signInWithGoogle()}
      >
        Sign in with Google
      </Button>
      <View className="flex-row justify-center gap-1">
        <Text variant="muted" style={textColor(scheme, "muted")}>
          Don&apos;t have an account?
        </Text>
        <Link href="/sign-up">
          <Text variant="small" style={textColor(scheme)}>
            Sign up
          </Text>
        </Link>
      </View>
    </AuthPage>
  );
}
