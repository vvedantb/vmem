import { useSignUp } from "@clerk/clerk-expo";
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

/** Email and password with an emailed code, or Google, as in the archived vmem app. */
export default function SignUpScreen() {
  const { signUp, setActive, isLoaded } = useSignUp();
  const router = useRouter();
  const scheme = useScheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [pendingVerification, setPendingVerification] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const signUpWithGoogle = useGoogleSignIn(setError);

  async function handleSignUp() {
    if (!isLoaded) return;
    if (!email || !password) {
      setError("Enter your email and a password.");
      return;
    }
    if (password.length < 8) {
      setError("Use at least 8 characters for the password.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await signUp.create({ emailAddress: email, password });
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setPendingVerification(true);
    } catch (caught) {
      setError(authErrorMessage(toError(caught)));
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify() {
    if (!isLoaded) return;
    if (code.length < 4) {
      setError("Enter the full code from the email.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const result = await signUp.attemptEmailAddressVerification({ code });
      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        router.replace("/");
      } else {
        setError(
          "This account needs another step. Use vmem on the web to finish it.",
        );
      }
    } catch (caught) {
      setError(authErrorMessage(toError(caught)));
    } finally {
      setLoading(false);
    }
  }

  if (pendingVerification) {
    return (
      <AuthPage
        title="Check your email"
        description="Enter the code we sent to your email"
      >
        <View className="gap-4">
          <View className="gap-1.5">
            <Label>Code</Label>
            <Input
              value={code}
              onChangeText={setCode}
              placeholder="Enter code"
              autoComplete="one-time-code"
              keyboardType="number-pad"
            />
          </View>
          <FieldError message={error} />
          <Button onPress={() => void handleVerify()} loading={loading}>
            {loading ? "Verifying..." : "Verify"}
          </Button>
        </View>
      </AuthPage>
    );
  }

  return (
    <AuthPage title="Create account" description="Sign up to get started">
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
            autoComplete="new-password"
            secureTextEntry
          />
        </View>
        <FieldError message={error} />
        <Button onPress={() => void handleSignUp()} loading={loading}>
          {loading ? "Creating account..." : "Create account"}
        </Button>
      </View>
      <OrDivider />
      <Button
        variant="outline"
        leftIcon={<GoogleMark />}
        onPress={() => void signUpWithGoogle()}
      >
        Sign up with Google
      </Button>
      <View className="flex-row justify-center gap-1">
        <Text variant="muted" style={textColor(scheme, "muted")}>
          Already have an account?
        </Text>
        <Link href="/sign-in">
          <Text variant="small" style={textColor(scheme)}>
            Sign in
          </Text>
        </Link>
      </View>
      {/* Bot protection widget slot for sign-up. */}
      <View nativeID="clerk-captcha" />
    </AuthPage>
  );
}
