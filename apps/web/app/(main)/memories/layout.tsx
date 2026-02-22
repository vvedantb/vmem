"use client";

import { Tabs, TabsList, TabsTrigger } from "@vmem/ui";
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

  const tabs = (
    <Tabs
      value={currentTab}
      onValueChange={(value) => router.push(`/memories/${value}`)}
    >
      <TabsList>
        <TabsTrigger value="list">
          <div className="flex items-center gap-2">
            <IconList size={18} stroke={1.5} />
            <span>List</span>
          </div>
        </TabsTrigger>
        <TabsTrigger value="graph">
          <div className="flex items-center gap-2">
            <IconShare3 size={18} stroke={1.5} />
            <span>Graph</span>
          </div>
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );

  return (
    <PageContainer
      title="Memories"
      centerSection={tabs}
      rightSection={<AddMemoryModal />}
    >
      {children}
    </PageContainer>
  );
}
