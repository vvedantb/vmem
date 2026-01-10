import { NextRequest, NextResponse } from "next/server";
import { connectors, syncSimulations } from "../store";

// GET /api/connectors/[id] - Get a single connector
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  await new Promise((resolve) => setTimeout(resolve, 100));

  const connector = connectors.find((c) => c.id === id);

  if (!connector) {
    return NextResponse.json(
      { success: false, error: "Connector not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({
    success: true,
    data: connector,
  });
}

// POST /api/connectors/[id]/connect - Connect a connector (handled via action param)
// POST /api/connectors/[id]/disconnect - Disconnect a connector (handled via action param)
// POST /api/connectors/[id]/sync - Start sync (handled via action param)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const connector = connectors.find((c) => c.id === id);

  if (!connector) {
    return NextResponse.json(
      { success: false, error: "Connector not found" },
      { status: 404 }
    );
  }

  let body: { action: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid request body" },
      { status: 400 }
    );
  }

  const { action } = body;

  switch (action) {
    case "connect": {
      // Simulate OAuth flow delay
      await new Promise((resolve) => setTimeout(resolve, 1500));

      connector.connectionStatus = "connected";
      connector.lastSyncAt = null;
      connector.itemsSynced = 0;
      connector.errorMessage = null;

      return NextResponse.json({
        success: true,
        data: connector,
        message: `Connected to ${connector.name}`,
      });
    }

    case "disconnect": {
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Clear any ongoing sync
      const existingInterval = syncSimulations.get(id);
      if (existingInterval) {
        clearInterval(existingInterval);
        syncSimulations.delete(id);
      }

      connector.connectionStatus = "disconnected";
      connector.syncStatus = "idle";
      connector.syncProgress = 0;
      connector.lastSyncAt = null;
      connector.itemsSynced = 0;
      connector.errorMessage = null;

      return NextResponse.json({
        success: true,
        data: connector,
        message: `Disconnected from ${connector.name}`,
      });
    }

    case "sync": {
      if (connector.connectionStatus !== "connected") {
        return NextResponse.json(
          { success: false, error: "Connector is not connected" },
          { status: 400 }
        );
      }

      if (connector.syncStatus === "syncing") {
        return NextResponse.json(
          { success: false, error: "Sync already in progress" },
          { status: 400 }
        );
      }

      // Start sync simulation
      connector.syncStatus = "syncing";
      connector.syncProgress = 0;
      connector.errorMessage = null;

      // Simulate gradual progress (will be polled by client)
      const intervalId = setInterval(() => {
        if (connector.syncProgress >= 100) {
          clearInterval(intervalId);
          syncSimulations.delete(id);
          connector.syncStatus = "idle";
          connector.lastSyncAt = new Date().toISOString();
          connector.itemsSynced += Math.floor(Math.random() * 20) + 5;
        } else {
          connector.syncProgress += Math.floor(Math.random() * 15) + 5;
          if (connector.syncProgress > 100) {
            connector.syncProgress = 100;
          }
        }
      }, 500);

      syncSimulations.set(id, intervalId);

      return NextResponse.json({
        success: true,
        data: connector,
        message: `Sync started for ${connector.name}`,
      });
    }

    default:
      return NextResponse.json(
        { success: false, error: "Invalid action" },
        { status: 400 }
      );
  }
}
