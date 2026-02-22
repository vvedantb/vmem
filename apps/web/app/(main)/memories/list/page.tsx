import { Suspense } from "react";
import MemorySearch from "@/components/MemorySearch";

export default function MemoriesListPage() {
  return (
    <Suspense>
      <MemorySearch />
    </Suspense>
  );
}
