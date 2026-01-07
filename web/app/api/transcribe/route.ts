import { NextRequest, NextResponse } from "next/server";

// Mock transcription responses for demo purposes
const mockTranscriptions = [
  "I learned about React hooks today. useState and useEffect are the most commonly used hooks. Custom hooks are great for reusing stateful logic.",
  "Had a productive meeting about the new feature. We decided to use TypeScript for better type safety and developer experience.",
  "Reading about system design patterns. Load balancers, caching strategies, and database sharding are important concepts for scalability.",
  "Figured out the bug in the authentication flow. The issue was with token refresh timing - needed to add a buffer before expiration.",
  "Great progress on the project today. Completed the API integration and started working on the frontend components.",
];

// POST /api/transcribe - Transcribe audio file (mock)
export async function POST(request: NextRequest) {
  try {
    // Simulate transcription delay (would be longer with real AI)
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const formData = await request.formData();
    const audioFile = formData.get("audio");

    if (!audioFile) {
      return NextResponse.json(
        { success: false, error: "No audio file provided" },
        { status: 400 }
      );
    }

    // Return a random mock transcription
    const randomIndex = Math.floor(Math.random() * mockTranscriptions.length);
    const transcription = mockTranscriptions[randomIndex];

    return NextResponse.json({
      success: true,
      data: {
        text: transcription,
        duration: Math.random() * 30 + 5, // Mock duration 5-35 seconds
        confidence: 0.85 + Math.random() * 0.14, // Mock confidence 85-99%
      },
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to process audio" },
      { status: 500 }
    );
  }
}
