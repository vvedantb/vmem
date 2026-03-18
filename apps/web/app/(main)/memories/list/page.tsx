"use client";

import { Suspense } from "react";
import PageContainer from "@/components/PageContainer";
import AddMemoryModal from "@/components/AddMemoryModal";
import MemorySearch from "@/components/MemorySearch";

export default function MemoriesListPage() {
  return (
    <PageContainer title="Memories" rightSection={<AddMemoryModal />}>
      <Suspense>
        <MemorySearch />
      </Suspense>
    </PageContainer>
  );
}
