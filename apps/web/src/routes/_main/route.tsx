import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { AuthGate } from "@/providers/AuthGate";
import MainShell from "@/components/shell/MainShell";

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
