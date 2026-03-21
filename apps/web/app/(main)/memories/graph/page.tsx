"use client";

import PageContainer from "@/components/PageContainer";
import MemoryGraph from "@/components/MemoryGraph";

export default function MemoriesGraphPage() {
  return (
    <PageContainer title="Memories">
      <div className="h-full min-h-0 -mb-6">
        <MemoryGraph />
      </div>
    </PageContainer>
  );
}
