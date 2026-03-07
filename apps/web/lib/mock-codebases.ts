export interface CodebaseFile {
  path: string;
  language: string;
  size: string;
  lastIndexed: string;
}

export interface Codebase {
  id: string;
  name: string;
  description: string;
  language: string;
  filesIndexed: number;
  totalFiles: number;
  lastIndexed: string;
  status: "indexed" | "indexing" | "error";
  repoUrl: string;
  branch: string;
  files: CodebaseFile[];
}

export const mockCodebases: Codebase[] = [
  {
    id: "cb_1",
    name: "vmem-core",
    description: "Core memory layer API and database schema",
    language: "TypeScript",
    filesIndexed: 142,
    totalFiles: 142,
    lastIndexed: "2026-03-07T10:30:00Z",
    status: "indexed",
    repoUrl: "https://github.com/acme/vmem-core",
    branch: "main",
    files: [
      {
        path: "src/index.ts",
        language: "TypeScript",
        size: "2.4 KB",
        lastIndexed: "2026-03-07T10:30:00Z",
      },
      {
        path: "src/schema.ts",
        language: "TypeScript",
        size: "5.1 KB",
        lastIndexed: "2026-03-07T10:30:00Z",
      },
      {
        path: "src/api/memories.ts",
        language: "TypeScript",
        size: "8.3 KB",
        lastIndexed: "2026-03-07T10:30:00Z",
      },
      {
        path: "src/api/auth.ts",
        language: "TypeScript",
        size: "3.7 KB",
        lastIndexed: "2026-03-07T10:30:00Z",
      },
      {
        path: "src/utils/encryption.ts",
        language: "TypeScript",
        size: "1.9 KB",
        lastIndexed: "2026-03-07T10:30:00Z",
      },
    ],
  },
  {
    id: "cb_2",
    name: "dashboard-ui",
    description: "Next.js frontend dashboard application",
    language: "TypeScript",
    filesIndexed: 87,
    totalFiles: 93,
    lastIndexed: "2026-03-06T18:15:00Z",
    status: "indexing",
    repoUrl: "https://github.com/acme/dashboard-ui",
    branch: "develop",
    files: [
      {
        path: "app/layout.tsx",
        language: "TypeScript",
        size: "1.8 KB",
        lastIndexed: "2026-03-06T18:15:00Z",
      },
      {
        path: "app/page.tsx",
        language: "TypeScript",
        size: "3.2 KB",
        lastIndexed: "2026-03-06T18:15:00Z",
      },
      {
        path: "components/Sidebar.tsx",
        language: "TypeScript",
        size: "6.5 KB",
        lastIndexed: "2026-03-06T18:15:00Z",
      },
      {
        path: "lib/api.ts",
        language: "TypeScript",
        size: "4.1 KB",
        lastIndexed: "2026-03-06T18:15:00Z",
      },
    ],
  },
  {
    id: "cb_3",
    name: "ml-pipeline",
    description: "Machine learning data processing pipeline",
    language: "Python",
    filesIndexed: 56,
    totalFiles: 56,
    lastIndexed: "2026-03-05T09:00:00Z",
    status: "indexed",
    repoUrl: "https://github.com/acme/ml-pipeline",
    branch: "main",
    files: [
      {
        path: "pipeline/main.py",
        language: "Python",
        size: "4.8 KB",
        lastIndexed: "2026-03-05T09:00:00Z",
      },
      {
        path: "pipeline/transforms.py",
        language: "Python",
        size: "7.2 KB",
        lastIndexed: "2026-03-05T09:00:00Z",
      },
      {
        path: "pipeline/models.py",
        language: "Python",
        size: "9.6 KB",
        lastIndexed: "2026-03-05T09:00:00Z",
      },
      {
        path: "tests/test_pipeline.py",
        language: "Python",
        size: "3.4 KB",
        lastIndexed: "2026-03-05T09:00:00Z",
      },
    ],
  },
  {
    id: "cb_4",
    name: "auth-service",
    description: "Authentication and authorization microservice",
    language: "Go",
    filesIndexed: 0,
    totalFiles: 34,
    lastIndexed: "2026-03-04T14:22:00Z",
    status: "error",
    repoUrl: "https://github.com/acme/auth-service",
    branch: "main",
    files: [],
  },
];
