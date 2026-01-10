import { NextRequest, NextResponse } from "next/server";
import { apiKeys } from "../store";

// DELETE /api/keys/[id] - Revoke an API key
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 400));

  const { id } = await params;

  const keyIndex = apiKeys.findIndex((key) => key.id === id);

  if (keyIndex === -1) {
    return NextResponse.json(
      { success: false, error: "API key not found" },
      { status: 404 }
    );
  }

  const key = apiKeys[keyIndex];

  if (key.status === "revoked") {
    return NextResponse.json(
      { success: false, error: "API key is already revoked" },
      { status: 400 }
    );
  }

  // Mark as revoked (we keep it in the list for history)
  key.status = "revoked";

  return NextResponse.json({
    success: true,
    message: "API key revoked successfully",
    data: {
      id: key.id,
      name: key.name,
      maskedKey: key.maskedKey,
      status: key.status,
    },
  });
}
