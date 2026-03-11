"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import PageContainer from "@/components/PageContainer";

const tabs = [
  { label: "Logs", href: "/api/logs" },
  { label: "Keys", href: "/api/keys" },
];

function ApiTabs() {
  const pathname = usePathname();
  return (
    <nav
      className="flex gap-1 rounded-lg bg-muted p-1"
      aria-label="API sections"
    >
      {tabs.map((tab) => {
        const isActive = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
              isActive
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
            aria-current={isActive ? "page" : undefined}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

export default function ApiLayout({ children }: { children: React.ReactNode }) {
  return (
    <PageContainer title="API" centerSection={<ApiTabs />}>
      {children}
    </PageContainer>
  );
}
