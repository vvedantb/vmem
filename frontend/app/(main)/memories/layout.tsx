"use client";

import { Tabs, Tab } from "@heroui/react";
import { usePathname, useRouter } from "next/navigation";
import PageContainer from "@/components/PageContainer";
import AddMemoryModal from "@/components/AddMemoryModal";
import { IconList, IconShare3 } from "@tabler/icons-react";

export default function MemoriesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const currentTab = pathname.includes("/memories/graph") ? "graph" : "list";

  return (
    <PageContainer
      title="Memories"
      description="Browse and search your stored memories"
      rightSection={<AddMemoryModal />}
    >
      <Tabs
        selectedKey={currentTab}
        onSelectionChange={(key) => router.push(`/memories/${key}`)}
        classNames={{
          tabList:
            "bg-black/[0.02] dark:bg-white/[0.02] border border-black/10 dark:border-white/10 p-1 rounded-xl",
          cursor: "bg-black dark:bg-white",
          tab: "h-10 px-4",
          tabContent:
            "group-data-[selected=true]:text-white dark:group-data-[selected=true]:text-black text-neutral-500",
        }}
      >
        <Tab
          key="list"
          title={
            <div className="flex items-center gap-2">
              <IconList size={18} stroke={1.5} />
              <span>List</span>
            </div>
          }
        />
        <Tab
          key="graph"
          title={
            <div className="flex items-center gap-2">
              <IconShare3 size={18} stroke={1.5} />
              <span>Graph</span>
            </div>
          }
        />
      </Tabs>

      {children}
    </PageContainer>
  );
}
