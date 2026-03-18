"use client";

import { Suspense, useState } from "react";
import { Input } from "@vmem/ui";
import { IconSearch } from "@tabler/icons-react";
import PageContainer from "@/components/PageContainer";
import AddMemoryModal from "@/components/AddMemoryModal";
import MemorySearch from "@/components/MemorySearch";

function SearchInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (query: string) => void;
}) {
  return (
    <div className="relative w-full max-w-md">
      <div className="absolute left-3 top-1/2 -translate-y-1/2">
        <IconSearch className="text-muted-foreground" size={16} stroke={1.5} />
      </div>
      <Input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search memories..."
        className="h-9 bg-muted/50 border-border pl-9 text-foreground hover:bg-accent focus-visible:border-ring"
      />
    </div>
  );
}

export default function MemoriesListPage() {
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <PageContainer
      title="Memories"
      centerSection={
        <SearchInput value={searchQuery} onChange={setSearchQuery} />
      }
      rightSection={<AddMemoryModal />}
    >
      <Suspense>
        <MemorySearch
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />
      </Suspense>
    </PageContainer>
  );
}
