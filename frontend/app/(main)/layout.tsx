import Sidebar from "@/components/Sidebar";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-white dark:bg-black">
      <Sidebar />
      <main className="md:ml-[20%] min-h-screen">
        <div className="px-8 py-16 md:px-16 md:py-20">{children}</div>
      </main>
    </div>
  );
}
