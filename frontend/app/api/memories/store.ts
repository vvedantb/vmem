// Shared in-memory store for mock data (will reset on server restart)
// This simulates a database for development purposes

export interface Memory {
  id: string;
  title: string;
  content: string;
  tags: string[];
  createdAt: string;
}

export const memories: Memory[] = [
  {
    id: "1",
    title: "First React Project",
    content:
      "Built my first React application today. Learned about components, props, and state management. The virtual DOM concept finally clicked!",
    tags: ["react", "learning", "javascript"],
    createdAt: new Date("2024-01-15").toISOString(),
  },
  {
    id: "2",
    title: "Docker Fundamentals",
    content:
      "Containerization with Docker. Key commands: docker build, docker run, docker-compose. Understood the difference between images and containers.",
    tags: ["docker", "devops"],
    createdAt: new Date("2024-01-20").toISOString(),
  },
  {
    id: "3",
    title: "TypeScript Tips",
    content:
      "TypeScript generics are powerful. Use them for reusable type-safe code. Also learned about utility types: Partial, Required, Pick, Omit.",
    tags: ["typescript", "tips"],
    createdAt: new Date("2024-02-05").toISOString(),
  },
];
