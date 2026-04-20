import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { AuthGate } from "@/components/providers/ClientProvider";
import MainShell from "@/components/MainShell";

export const Route = createFileRoute("/_main")({
  beforeLoad: ({ context }) => {
    if (!context.isSignedIn) {
      throw redirect({ to: "/" });
    }
  },
  component: MainLayout,
});

function MainLayout() {
  return (
    <AuthGate>
      <MainShell>
        <Outlet />
      </MainShell>
    </AuthGate>
  );
}
