import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import MainShell from "@/components/MainShell";
import { EnsureUser } from "@/components/providers/EnsureUser";

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
    <EnsureUser>
      <MainShell>
        <Outlet />
      </MainShell>
    </EnsureUser>
  );
}
