import Sidebar from "@/components/Sidebar";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="h-screen overflow-hidden bg-neutral-200 dark:bg-black">
      <Sidebar />
      <main className="md:ml-[18%] h-[calc(100vh-4rem)] md:h-screen mt-16 md:mt-0 p-2 md:p-3 flex">
        <div className="flex-1 flex flex-col p-6 md:p-8 rounded-2xl bg-white dark:bg-neutral-900 overflow-y-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
