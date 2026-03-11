"use client";

import PageContainer from "@/components/PageContainer";

export default function ApiLayout({ children }: { children: React.ReactNode }) {
  return <PageContainer title="API">{children}</PageContainer>;
}
