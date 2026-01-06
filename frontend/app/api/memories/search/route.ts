import { NextRequest, NextResponse } from "next/server";

// Reference to the same mock data (in real app, this would be a database)
// For the mock, we'll define some sample memories here
const memories = [
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

interface Memory {
  id: string;
  title: string;
  content: string;
  tags: string[];
  createdAt: string;
}

interface SearchResult extends Memory {
  relevanceScore: number;
}

interface SearchRequest {
  query: string;
  limit?: number;
}

// Simple mock "semantic" search that simulates relevance scoring
// In a real app, this would use embeddings and vector similarity
function calculateRelevanceScore(memory: Memory, query: string): number {
  const queryLower = query.toLowerCase();
  const words = queryLower.split(/\s+/).filter((w) => w.length > 0);

  let score = 0;

  // Check title matches (highest weight)
  const titleLower = memory.title.toLowerCase();
  if (titleLower.includes(queryLower)) {
    score += 0.5; // Exact phrase match in title
  }
  words.forEach((word) => {
    if (titleLower.includes(word)) {
      score += 0.15;
    }
  });

  // Check content matches (medium weight)
  const contentLower = memory.content.toLowerCase();
  if (contentLower.includes(queryLower)) {
    score += 0.3; // Exact phrase match in content
  }
  words.forEach((word) => {
    if (contentLower.includes(word)) {
      score += 0.08;
    }
  });

  // Check tag matches (good weight for exact matches)
  memory.tags.forEach((tag) => {
    const tagLower = tag.toLowerCase();
    if (tagLower === queryLower || words.includes(tagLower)) {
      score += 0.25;
    } else if (words.some((word) => tagLower.includes(word))) {
      score += 0.1;
    }
  });

  // Normalize to 0-1 range and add some randomness for realistic simulation
  const normalizedScore = Math.min(score, 1);
  const jitter = (Math.random() - 0.5) * 0.1; // ±5% jitter
  return Math.max(0, Math.min(1, normalizedScore + jitter));
}

// POST /api/memories/search - Semantic search for memories
export async function POST(request: NextRequest) {
  try {
    // Simulate network delay for search
    await new Promise((resolve) => setTimeout(resolve, 400));

    const body: SearchRequest = await request.json();

    // Validation
    if (!body.query?.trim()) {
      return NextResponse.json(
        { success: false, error: "Search query is required" },
        { status: 400 }
      );
    }

    const query = body.query.trim();
    const limit = body.limit || 20;

    // Calculate relevance scores for all memories
    const scoredResults: SearchResult[] = memories
      .map((memory) => ({
        ...memory,
        relevanceScore: calculateRelevanceScore(memory, query),
      }))
      .filter((result) => result.relevanceScore > 0.05) // Filter out very low matches
      .sort((a, b) => b.relevanceScore - a.relevanceScore) // Sort by relevance
      .slice(0, limit);

    return NextResponse.json({
      success: true,
      data: scoredResults,
      count: scoredResults.length,
      query: query,
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid request body" },
      { status: 400 }
    );
  }
}
