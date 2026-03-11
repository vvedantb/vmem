"use client";

import PageContainer from "@/components/PageContainer";
import AddMemoryModal from "@/components/AddMemoryModal";

export default function MemoriesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PageContainer title="Memories" rightSection={<AddMemoryModal />}>
      {children}
    </PageContainer>
  );
}
