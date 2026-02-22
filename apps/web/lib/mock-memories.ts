import type { Memory } from "@/lib/memories";

export const MOCK_MEMORIES: Memory[] = [
  {
    id: "mem-01",
    title: "React rendering notes",
    content:
      "Use memoization only when profiling shows real render pressure. Prefer splitting large components before overusing memo hooks.",
    tags: ["react", "frontend", "performance"],
    createdAt: "2026-02-18T10:12:00.000Z",
  },
  {
    id: "mem-02",
    title: "Docker local dev setup",
    content:
      "Keep compose files minimal for local use. Mount source code, cache package manager folders, and isolate database volumes per project.",
    tags: ["docker", "devops"],
    createdAt: "2026-02-17T16:40:00.000Z",
  },
  {
    id: "mem-03",
    title: "TypeScript strict mode checklist",
    content:
      "Avoid any, model API responses with runtime validation, and keep tsconfig strict flags enabled for shared packages.",
    tags: ["typescript", "backend", "quality"],
    createdAt: "2026-02-16T09:05:00.000Z",
  },
  {
    id: "mem-04",
    title: "Postgres indexing reminder",
    content:
      "Use composite indexes that match filter order. Measure write amplification before adding broad indexes on hot tables.",
    tags: ["database", "postgres", "performance"],
    createdAt: "2026-02-14T14:20:00.000Z",
  },
  {
    id: "mem-05",
    title: "User interview summary",
    content:
      "Power users want faster search, fewer clicks to edit tags, and clearer export options for backups.",
    tags: ["product", "research", "ux"],
    createdAt: "2026-02-12T11:30:00.000Z",
  },
  {
    id: "mem-06",
    title: "API error handling pattern",
    content:
      "Return stable error codes, keep messages user-safe, and log detailed diagnostics with request context for debugging.",
    tags: ["api", "backend", "reliability"],
    createdAt: "2026-02-10T19:50:00.000Z",
  },
  {
    id: "mem-07",
    title: "Next.js route strategy",
    content:
      "Use server components by default for data-heavy pages. Add client components only when interaction state is required.",
    tags: ["nextjs", "frontend", "architecture"],
    createdAt: "2026-02-08T08:15:00.000Z",
  },
  {
    id: "mem-08",
    title: "On-call handoff checklist",
    content:
      "Document active incidents, high-risk deploys, pending rollbacks, and top alerts with clear owner and ETA.",
    tags: ["ops", "team", "process"],
    createdAt: "2026-02-05T22:10:00.000Z",
  },
];
