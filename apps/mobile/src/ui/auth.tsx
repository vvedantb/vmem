import { isClerkAPIResponseError, useSSO } from "@clerk/clerk-expo";
import { Text } from "@vvedantb/native-ui/primitives";
import * as AuthSession from "expo-auth-session";
import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { KeyboardAvoidingView, ScrollView, View } from "react-native";
import { SSO_PATH, SSO_SCHEME } from "../config";
import { toError } from "../errors";
import { textColor, useScheme } from "./theme";

/** A readable message from a sign-in error. */
export function authErrorMessage(error: Error): string {
  if (isClerkAPIResponseError(error)) {
    return (
      error.errors[0]?.longMessage ?? error.errors[0]?.message ?? error.message
    );
  }
  return error.message;
}

/**
 * Google sign-in, as in the archived vmem app: `useSSO` with the
 * `vmem://sso-callback` redirect.
 */
export function useGoogleSignIn(onError: (message: string) => void) {
  const { startSSOFlow } = useSSO();
  const router = useRouter();
  return async () => {
    try {
      const { createdSessionId, setActive } = await startSSOFlow({
        strategy: "oauth_google",
        redirectUrl: AuthSession.makeRedirectUri({
          scheme: SSO_SCHEME,
          path: SSO_PATH,
        }),
      });
      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
        router.replace("/");
      }
      // No session: the user closed the browser, or more steps are needed.
    } catch (caught) {
      onError(authErrorMessage(toError(caught)));
    }
  };
}

/** The sign-in and sign-up page frame. */
export function AuthPage({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  const scheme = useScheme();
  return (
    <KeyboardAvoidingView behavior="height" className="flex-1">
      <ScrollView
        className="flex-1"
        contentContainerClassName="grow justify-center px-6 py-12"
        keyboardShouldPersistTaps="handled"
      >
        <View className="gap-6">
          <View className="gap-2">
            <Text variant="h3" style={textColor(scheme)}>
              {title}
            </Text>
            <Text variant="muted" style={textColor(scheme, "muted")}>
              {description}
            </Text>
          </View>
          {children}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export function OrDivider() {
  const scheme = useScheme();
  return (
    <View className="flex-row items-center gap-3">
      <View className="h-px flex-1 bg-border" />
      <Text variant="muted" style={textColor(scheme, "muted")}>
        or
      </Text>
      <View className="h-px flex-1 bg-border" />
    </View>
  );
}

export function FieldError({ message }: { message: string }) {
  if (!message) return null;
  return (
    <Text variant="small" className="text-destructive">
      {message}
    </Text>
  );
}
