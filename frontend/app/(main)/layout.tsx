import Sidebar from "@/components/Sidebar";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-neutral-200 dark:bg-black">
      <Sidebar />
      <main className="md:ml-[18%] min-h-screen p-3 flex">
        <div className="flex-1 min-h-max px-8 py-12 rounded-2xl bg-white dark:bg-neutral-900">
          {children}
        </div>
      </main>
    </div>
  );
}
