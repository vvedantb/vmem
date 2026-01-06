import { NextRequest, NextResponse } from "next/server";
import { apiKeys, generateApiKey, maskApiKey, ApiKey } from "./store";

// GET /api/keys - Fetch all API keys
export async function GET() {
  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 300));

  // Return keys with masked values (never return full keys)
  const safeKeys = apiKeys.map((key) => ({
    id: key.id,
    name: key.name,
    maskedKey: key.maskedKey,
    createdAt: key.createdAt,
    lastUsedAt: key.lastUsedAt,
    requestCount: key.requestCount,
    status: key.status,
  }));

  return NextResponse.json({
    success: true,
    data: safeKeys,
    count: safeKeys.length,
  });
}

// POST /api/keys - Create a new API key
export async function POST(request: NextRequest) {
  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 500));

  try {
    const body = await request.json();
    const { name } = body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: "Name is required" },
        { status: 400 }
      );
    }

    if (name.length > 50) {
      return NextResponse.json(
        { success: false, error: "Name must be 50 characters or less" },
        { status: 400 }
      );
    }

    // Generate new key
    const fullKey = generateApiKey();
    const newKey: ApiKey = {
      id: `key_${Date.now()}`,
      name: name.trim(),
      key: fullKey,
      maskedKey: maskApiKey(fullKey),
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
      requestCount: 0,
      status: "active",
    };

    // Add to store
    apiKeys.push(newKey);

    // Return the full key only on creation (this is the only time it's visible)
    return NextResponse.json({
      success: true,
      data: {
        id: newKey.id,
        name: newKey.name,
        key: fullKey, // Full key returned only on creation
        maskedKey: newKey.maskedKey,
        createdAt: newKey.createdAt,
        lastUsedAt: newKey.lastUsedAt,
        requestCount: newKey.requestCount,
        status: newKey.status,
      },
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid request body" },
      { status: 400 }
    );
  }
}
