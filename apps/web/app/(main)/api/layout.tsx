"use client";

import { Tabs, TabsList, TabsTrigger } from "@vmem/ui";
import { usePathname, useRouter } from "next/navigation";
import PageContainer from "@/components/PageContainer";
import { IconKey, IconFileText } from "@tabler/icons-react";

export default function ApiLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const currentTab = pathname.includes("/api/keys") ? "keys" : "logs";

  return (
    <PageContainer title="API">
      <Tabs
        value={currentTab}
        onValueChange={(value) => router.push(`/api/${value}`)}
      >
        <TabsList>
          <TabsTrigger value="logs">
            <IconFileText size={18} stroke={1.5} />
            <span>Logs</span>
          </TabsTrigger>
          <TabsTrigger value="keys">
            <IconKey size={18} stroke={1.5} />
            <span>Keys</span>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {children}
    </PageContainer>
  );
}
