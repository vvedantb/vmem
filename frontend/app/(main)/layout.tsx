import Sidebar from "@/components/Sidebar";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-white dark:bg-black">
      <Sidebar />
      <main className="md:ml-[18%] min-h-screen">
        <div className="px-8 py-16 md:px-12 md:py-16">{children}</div>
      </main>
    </div>
  );
}
