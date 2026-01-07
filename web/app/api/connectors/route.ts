import { NextResponse } from "next/server";
import { connectors } from "./store";

// GET /api/connectors - Fetch all connectors
export async function GET() {
  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 300));

  return NextResponse.json({
    success: true,
    data: connectors,
    count: connectors.length,
  });
}
