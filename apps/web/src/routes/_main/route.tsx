import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import MainShell from "@/components/MainShell";
import { EnsureUser } from "@/components/providers/EnsureUser";
import { ThemeProvider } from "@/components/contexts/ThemeContext";
import { NotificationProvider } from "@/components/contexts/NotificationContext";
import { MemoryProvider } from "@/components/contexts/MemoryContext";
import { LocalLLMProvider } from "@/components/contexts/LocalLLMContext";
import { VoiceProvider } from "@/components/contexts/VoiceContext";
import { PendingEnrichmentRunner } from "@/components/PendingEnrichmentRunner";

export const Route = createFileRoute("/_main")({
  beforeLoad: ({ context }) => {
    if (!context.isSignedIn) {
      throw redirect({ to: "/" });
    }
  },
  component: MainLayout,
});

// Auth-dependent providers are here (not in __root.tsx) since they require authentication
function MainLayout() {
  return (
    <EnsureUser>
      <ThemeProvider>
        <NotificationProvider>
          <LocalLLMProvider>
            <VoiceProvider>
              <MemoryProvider>
                <PendingEnrichmentRunner />
                <MainShell>
                  <Outlet />
                </MainShell>
              </MemoryProvider>
            </VoiceProvider>
          </LocalLLMProvider>
        </NotificationProvider>
      </ThemeProvider>
    </EnsureUser>
  );
}
