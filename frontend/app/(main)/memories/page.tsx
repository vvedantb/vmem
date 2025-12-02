import MemorySearch from "@/components/MemorySearch";

const mockMemories = [
  {
    id: "1",
    title: "How to structure a React project",
    tags: ["react", "architecture"],
    createdAt: "Dec 1, 2025",
  },
  {
    id: "2",
    title: "Meeting notes: Q4 planning session",
    tags: ["meetings", "planning"],
    createdAt: "Nov 28, 2025",
  },
  {
    id: "3",
    title: "Database optimization techniques",
    tags: ["database", "performance"],
    createdAt: "Nov 25, 2025",
  },
  {
    id: "4",
    title: "Design system color tokens",
    tags: ["design", "tokens"],
    createdAt: "Nov 20, 2025",
  },
  {
    id: "5",
    title: "API rate limiting best practices",
    tags: ["api", "backend"],
    createdAt: "Nov 18, 2025",
  },
];

export default function MemoriesPage() {
  return (
    <div className="space-y-10">
      <div>
        <h2 className="text-3xl font-semibold tracking-tight text-black dark:text-white">
          Memories
        </h2>
        <p className="text-neutral-500 mt-2">
          Browse and search your stored memories
        </p>
      </div>

      <MemorySearch memories={mockMemories} />
    </div>
  );
}
