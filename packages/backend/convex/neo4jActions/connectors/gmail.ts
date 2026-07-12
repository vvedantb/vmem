"use node";

/**
 * Gmail connector — lists inbox messages (up to 500), extracts plain-text
 * bodies, and upserts into Neo4j with `sourceType: "gmail"`.
 */

// Scoped per-API package instead of the monolithic "googleapis" — the monolith's
// root types pull in every Google API (~1M lines of .d.ts) and dominated typecheck time.
import { gmail as gmailApi, auth as googleAuth } from "@googleapis/gmail";
import type { gmail_v1 } from "@googleapis/gmail";
import { type ActionCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import {
  markSyncComplete,
  markSyncError,
  maybeReportProgress,
  setupSync,
  upsertSyncedDoc,
} from "./shared";

export interface GmailSyncArgs {
  clerkId: string;
  connectorId: Id<"connectors">;
  accessToken: string;
}

const MAX_MESSAGES_PER_SYNC = 500;
const MAX_BODY_CHARS = 50_000;

function decodeBase64Url(data: string): string {
  const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  return Buffer.from(padded, "base64").toString("utf-8");
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractHeader(
  headers: gmail_v1.Schema$MessagePartHeader[] | undefined,
  name: string,
): string {
  if (!headers) return "";
  const match = headers.find(
    (header) => header.name?.toLowerCase() === name.toLowerCase(),
  );
  return match?.value ?? "";
}

function extractBodyFromPart(part: gmail_v1.Schema$MessagePart): string {
  if (part.mimeType === "text/plain" && part.body?.data) {
    return decodeBase64Url(part.body.data);
  }

  if (part.mimeType === "text/html" && part.body?.data) {
    return stripHtml(decodeBase64Url(part.body.data));
  }

  if (part.parts) {
    for (const child of part.parts) {
      const text = extractBodyFromPart(child);
      if (text) return text;
    }
  }

  return "";
}

function messageBody(payload: gmail_v1.Schema$MessagePart | undefined): string {
  if (!payload) return "";
  return extractBodyFromPart(payload).slice(0, MAX_BODY_CHARS);
}

export async function runGmailSync(
  ctx: ActionCtx,
  args: GmailSyncArgs,
): Promise<{ synced: number }> {
  const setup = await setupSync(ctx, args.clerkId);

  try {
    const oauth = new googleAuth.OAuth2();
    oauth.setCredentials({ access_token: args.accessToken });
    const gmail = gmailApi({ version: "v1", auth: oauth });

    let pageToken: string | undefined;
    let totalSynced = 0;
    let totalFound = 0;

    while (totalFound < MAX_MESSAGES_PER_SYNC) {
      const pageSize = Math.min(100, MAX_MESSAGES_PER_SYNC - totalFound);
      const listResponse = await gmail.users.messages.list({
        userId: "me",
        labelIds: ["INBOX"],
        maxResults: pageSize,
        pageToken,
      });

      const messageRefs = listResponse.data.messages ?? [];
      if (messageRefs.length === 0) break;

      totalFound += messageRefs.length;

      for (const ref of messageRefs) {
        if (!ref.id) continue;

        try {
          const full = await gmail.users.messages.get({
            userId: "me",
            id: ref.id,
            format: "full",
          });

          const payload = full.data.payload;
          const subject =
            extractHeader(payload?.headers, "Subject") || "(No subject)";
          const body = messageBody(payload);
          const content = body.length > 0 ? body : subject;
          totalSynced = await upsertSyncedDoc(ctx, {
            setup,
            clerkId: args.clerkId,
            totalSynced,
            doc: {
              title: subject,
              content,
              sourceType: "gmail",
              sourceId: ref.id,
              sourceUrl: `https://mail.google.com/mail/u/0/#inbox/${ref.id}`,
            },
          });
          await maybeReportProgress(ctx, {
            connectorId: args.connectorId,
            totalSynced,
            totalFound,
          });
        } catch (messageErr) {
          console.error(`Failed to sync Gmail message ${ref.id}:`, messageErr);
        }
      }

      pageToken = listResponse.data.nextPageToken ?? undefined;
      if (!pageToken) break;
    }

    await markSyncComplete(ctx, {
      connectorId: args.connectorId,
      clerkId: args.clerkId,
      totalSynced,
    });

    return { synced: totalSynced };
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "Gmail sync failed";
    console.error("Gmail sync error:", err);
    await markSyncError(ctx, {
      connectorId: args.connectorId,
      errorMessage,
    });
    throw err;
  }
}
