import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useSignUp, useSignIn } from "@clerk/clerk-expo";
import { useRouter } from "expo-router";
import { Button } from "@/components/ui/Button";

export default function VerifyEmailScreen() {
  const { signUp, setActive: setSignUpActive } = useSignUp();
  const { signIn, setActive: setSignInActive } = useSignIn();
  const router = useRouter();

  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  const isSignUpFlow = signUp?.status === "missing_requirements";

  async function handleVerify() {
    setLoading(true);
    setError("");
    try {
      if (isSignUpFlow) {
        if (!signUp || !setSignUpActive) return;
        const result = await signUp.attemptEmailAddressVerification({ code });
        if (result.status === "complete") {
          await setSignUpActive({ session: result.createdSessionId });
          router.replace("/(main)");
        }
      } else {
        if (!signIn || !setSignInActive) return;
        const result = await signIn.attemptFirstFactor({
          strategy: "email_code",
          code,
        });
        if (result.status === "complete") {
          await setSignInActive({ session: result.createdSessionId });
          router.replace("/(main)");
        }
      }
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setResending(true);
    setError("");
    try {
      if (isSignUpFlow) {
        if (!signUp) return;
        await signUp.prepareEmailAddressVerification({
          strategy: "email_code",
        });
      } else {
        if (!signIn) return;
        const emailFactor = signIn.supportedFirstFactors?.find(
          (f) => f.strategy === "email_code",
        );
        if (emailFactor && "emailAddressId" in emailFactor) {
          await signIn.prepareFirstFactor({
            strategy: "email_code",
            emailAddressId: emailFactor.emailAddressId,
          });
        }
      }
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      }
    } finally {
      setResending(false);
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
            Check your email
          </Text>
          <Text className="text-gray-500">
            Enter the 6-digit code we sent to your email
          </Text>
        </View>
        <View className="gap-4">
          <View className="gap-1.5">
            <Text className="text-sm font-medium text-gray-700">
              Verification code
            </Text>
            <TextInput
              value={code}
              onChangeText={setCode}
              placeholder="000000"
              placeholderTextColor="#9ca3af"
              keyboardType="number-pad"
              maxLength={6}
              className="border border-gray-300 rounded-lg px-4 py-3 text-base text-gray-900 bg-white text-center tracking-widest text-2xl font-bold"
            />
          </View>
          {error ? <Text className="text-red-500 text-sm">{error}</Text> : null}
          <Button
            onPress={handleVerify}
            title={loading ? "Verifying..." : "Verify email"}
            disabled={loading || code.length < 6}
          />
          <Button
            onPress={handleResend}
            title={resending ? "Sending..." : "Resend code"}
            variant="outline"
            disabled={resending}
          />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
