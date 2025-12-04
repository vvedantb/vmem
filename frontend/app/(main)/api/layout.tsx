"use client";

import { Tabs, Tab } from "@heroui/react";
import { usePathname, useRouter } from "next/navigation";
import PageContainer from "@/components/PageContainer";
import { IconKey, IconFileText } from "@tabler/icons-react";

export default function ApiLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const currentTab = pathname.includes("/api/keys") ? "keys" : "logs";

  return (
    <PageContainer
      title="API"
      description="Manage your API keys and monitor request logs"
    >
      <Tabs
        selectedKey={currentTab}
        onSelectionChange={(key) => router.push(`/api/${key}`)}
        variant="solid"
      >
        <Tab
          key="logs"
          title={
            <div className="flex items-center gap-2">
              <IconFileText size={18} stroke={1.5} />
              <span>Logs</span>
            </div>
          }
        />
        <Tab
          key="keys"
          title={
            <div className="flex items-center gap-2">
              <IconKey size={18} stroke={1.5} />
              <span>Keys</span>
            </div>
          }
        />
      </Tabs>

      {children}
    </PageContainer>
  );
}
