import type { Id } from "../../_generated/dataModel";

export const GOOGLE_DRIVE_SCOPE =
  "https://www.googleapis.com/auth/drive.readonly";
export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

export const GOOGLE_OAUTH_SCOPES = [GOOGLE_DRIVE_SCOPE, GMAIL_SCOPE];

export type GoogleProvider = "google_drive" | "gmail";

export function scopeIncludesGmail(scope: string): boolean {
  return scope.includes("gmail.readonly");
}

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
      row.connectionStatus === "connected" &&
      (row.provider === "google_drive" || row.provider === "gmail"),
  );

  const own = connected.find((row) => row.provider === forProvider);
  if (own) return own._id;

  const sibling =
    forProvider === "gmail"
      ? connected.find((row) => row.provider === "google_drive")
      : connected.find((row) => row.provider === "gmail");

  return sibling?._id ?? null;
}
