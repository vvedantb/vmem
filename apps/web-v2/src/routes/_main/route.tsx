import { createFileRoute, Outlet } from "@tanstack/react-router";
import MainShell from "@/components/MainShell";
import { EnsureUser } from "@/components/providers/EnsureUser";

export const Route = createFileRoute("/_main")({
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
