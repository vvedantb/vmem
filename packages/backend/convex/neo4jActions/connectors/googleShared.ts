import type { Id } from "../../_generated/dataModel";

export const GOOGLE_DRIVE_SCOPE =
  "https://www.googleapis.com/auth/drive.readonly";

export const GOOGLE_OAUTH_SCOPES = [GOOGLE_DRIVE_SCOPE];

export type GoogleProvider = "google_drive";

export function scopeIncludesDrive(scope: string): boolean {
  return scope.includes("drive.readonly");
}

export interface GoogleConnectorRow {
  _id: Id<"connectors">;
  provider: GoogleProvider | undefined;
  connectionStatus: "connected" | "disconnected";
}

export function pickGoogleTokenConnectorId(
  connectors: GoogleConnectorRow[],
  forProvider: GoogleProvider,
): Id<"connectors"> | null {
  const connected = connectors.filter(
    (row) =>
      row.connectionStatus === "connected" && row.provider === "google_drive",
  );

  return connected.find((row) => row.provider === forProvider)?._id ?? null;
}
