import { NextRequest } from "next/server";
import { memories, Memory } from "../memories/store";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  relevantMemories?: Memory[];
}

interface ChatRequest {
  message: string;
  history?: { role: "user" | "assistant"; content: string }[];
}

// Simple mock "semantic" search that simulates relevance scoring
function calculateRelevanceScore(memory: Memory, query: string): number {
  const queryLower = query.toLowerCase();
  const words = queryLower.split(/\s+/).filter((w) => w.length > 0);

  let score = 0;

  // Check title matches (highest weight)
  const titleLower = memory.title.toLowerCase();
  if (titleLower.includes(queryLower)) {
    score += 0.5;
  }
  words.forEach((word) => {
    if (titleLower.includes(word)) {
      score += 0.15;
    }
  });

  // Check content matches (medium weight)
  const contentLower = memory.content.toLowerCase();
  if (contentLower.includes(queryLower)) {
    score += 0.3;
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

  return Math.min(score, 1);
}

// Find relevant memories for the user's message
function findRelevantMemories(message: string, limit: number = 3): Memory[] {
  const scored = memories
    .map((memory) => ({
      memory,
      score: calculateRelevanceScore(memory, message),
    }))
    .filter((item) => item.score > 0.1)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored.map((item) => item.memory);
}

// Generate a mock AI response based on the user's message and relevant memories
function generateResponse(message: string, relevantMemories: Memory[]): string {
  const messageLower = message.toLowerCase();

  // If we found relevant memories, generate a contextual response
  if (relevantMemories.length > 0) {
    const memoryContext = relevantMemories
      .map((m) => `"${m.title}": ${m.content}`)
      .join("\n\n");

    // Generate response based on the query type
    if (
      messageLower.includes("what") ||
      messageLower.includes("tell me") ||
      messageLower.includes("explain")
    ) {
      const memory = relevantMemories[0];
      return `Based on your memories, I found some relevant information about "${memory.title}".\n\n${memory.content}\n\nThis memory was tagged with: ${memory.tags.join(", ")}.`;
    }

    if (
      messageLower.includes("how") ||
      messageLower.includes("can i") ||
      messageLower.includes("should i")
    ) {
      const memory = relevantMemories[0];
      return `Looking at your stored knowledge, I found this relevant information from "${memory.title}":\n\n${memory.content}\n\nWould you like me to elaborate on any specific aspect?`;
    }

    if (messageLower.includes("remember") || messageLower.includes("recall")) {
      return `Yes! I found ${relevantMemories.length} relevant ${relevantMemories.length === 1 ? "memory" : "memories"} about that:\n\n${memoryContext}\n\nIs there anything specific you'd like to know more about?`;
    }

    if (messageLower.includes("summary") || messageLower.includes("summarize")) {
      const tags = [...new Set(relevantMemories.flatMap((m) => m.tags))];
      return `Here's a summary from ${relevantMemories.length} related ${relevantMemories.length === 1 ? "memory" : "memories"}:\n\n${relevantMemories.map((m) => `• **${m.title}**: ${m.content.slice(0, 100)}...`).join("\n")}\n\nKey topics covered: ${tags.join(", ")}.`;
    }

    // Default contextual response
    return `I found ${relevantMemories.length} relevant ${relevantMemories.length === 1 ? "memory" : "memories"} that might help:\n\n${relevantMemories.map((m, i) => `${i + 1}. **${m.title}**\n   ${m.content.slice(0, 150)}${m.content.length > 150 ? "..." : ""}`).join("\n\n")}\n\nWould you like me to go into more detail about any of these?`;
  }

  // No relevant memories found - generate helpful response
  const noContextResponses = [
    "I couldn't find any memories directly related to your question. Would you like to add a new memory about this topic?",
    "I don't have any stored information about that. Try asking about topics you've saved as memories, or add new memories to expand my knowledge.",
    "That topic doesn't appear in your memories yet. You can add memories through the 'Add Memory' page, and I'll be able to help you recall them later.",
    "I searched through your memories but didn't find anything matching that query. Your memories cover topics like learning, development tools, and programming concepts.",
  ];

  return noContextResponses[Math.floor(Math.random() * noContextResponses.length)];
}

// POST /api/chat - Send a message and get a streamed response
export async function POST(request: NextRequest) {
  try {
    const body: ChatRequest = await request.json();

    // Validation
    if (!body.message?.trim()) {
      return new Response(
        JSON.stringify({ success: false, error: "Message is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const userMessage = body.message.trim();

    // Find relevant memories
    const relevantMemories = findRelevantMemories(userMessage);

    // Generate the full response
    const fullResponse = generateResponse(userMessage, relevantMemories);

    // Create a streaming response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        // Send relevant memories first as a JSON chunk
        const memoriesData = JSON.stringify({
          type: "memories",
          data: relevantMemories,
        });
        controller.enqueue(encoder.encode(`data: ${memoriesData}\n\n`));

        // Simulate streaming by sending the response word by word
        const words = fullResponse.split(" ");
        let currentContent = "";

        for (let i = 0; i < words.length; i++) {
          currentContent += (i === 0 ? "" : " ") + words[i];

          // Random delay between 20-80ms per word to simulate typing
          await new Promise((resolve) =>
            setTimeout(resolve, 20 + Math.random() * 60)
          );

          const chunk = JSON.stringify({
            type: "content",
            data: currentContent,
          });
          controller.enqueue(encoder.encode(`data: ${chunk}\n\n`));
        }

        // Send done signal
        const doneData = JSON.stringify({ type: "done" });
        controller.enqueue(encoder.encode(`data: ${doneData}\n\n`));

        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch {
    return new Response(
      JSON.stringify({ success: false, error: "Invalid request body" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }
}
