import { AuthLoading, Authenticated, Unauthenticated } from "convex/react";
import { Navigate } from "@tanstack/react-router";
import { SonnerToaster, TooltipProvider } from "@vvedantb/ui";
import { AppSkeleton } from "@/components/shell/AppSkeleton";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { NotificationProvider } from "@/contexts/NotificationContext";
import { MemoryProvider } from "@/contexts/MemoryContext";
import { useUpdateAvailableToast } from "@/providers/EnsureUser";
import { useTheme } from "@/providers/theme";

// forward resolved theme to sonner (light until the theme provider hydrates)
function ThemedSonnerToaster() {
  const { resolvedTheme } = useTheme();
  return (
    <SonnerToaster
      position="top-right"
      offset={{
        top: "var(--vmem-toast-offset-top)",
        right: "var(--vmem-toast-offset-right)",
      }}
      mobileOffset={{
        top: "var(--vmem-toast-offset-top)",
        right: "var(--vmem-toast-offset-right)",
      }}
      theme={resolvedTheme === "dark" ? "dark" : "light"}
    />
  );
}

function AuthenticatedApp({ children }: { children: React.ReactNode }) {
  useUpdateAvailableToast();
  return (
    <ThemeProvider>
      <TooltipProvider delayDuration={300}>
        <NotificationProvider>
          <MemoryProvider>{children}</MemoryProvider>
        </NotificationProvider>
      </TooltipProvider>
      <ThemedSonnerToaster />
    </ThemeProvider>
  );
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AuthLoading>
        <AppSkeleton />
      </AuthLoading>
      <Unauthenticated>
        <Navigate to="/" />
      </Unauthenticated>
      <Authenticated>
        <AuthenticatedApp>{children}</AuthenticatedApp>
      </Authenticated>
    </>
  );
}
