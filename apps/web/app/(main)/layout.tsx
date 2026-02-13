import Sidebar from "@/components/Sidebar";
import { EnsureUser } from "@/components/providers/EnsureUser";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <EnsureUser>
      <div className="h-screen overflow-hidden bg-sidebar">
        <Sidebar />
        <main className="md:ml-[18%] h-[calc(100vh-4rem)] md:h-screen mt-16 md:mt-0 md:p-3 flex">
          <div className="flex-1 flex flex-col px-7 py-5 md:rounded-2xl bg-card overflow-y-auto">
            {children}
          </div>
        </main>
      </div>
    </EnsureUser>
  );
}
