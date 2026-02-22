import MainShell from "@/components/MainShell";
import { EnsureUser } from "@/components/providers/EnsureUser";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <EnsureUser>
      <MainShell>{children}</MainShell>
    </EnsureUser>
  );
}
