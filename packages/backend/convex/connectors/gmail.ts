"use node";

import {
  auth as googleAuth,
  gmail as gmailApi,
  type gmail_v1,
} from "@googleapis/gmail";
import type { ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import {
  EMBED_CONTENT_CAP,
  mapSyncedDocs,
  runPaginatedConnectorSync,
  type ConnectorPage,
  type SyncedDoc,
} from "./syncShared";

export interface GmailSyncArgs {
  clerkId: string;
  connectorId: Id<"connectors">;
  accessToken: string;
}

// recent mail only so a sync never ingests the whole mailbox
export const GMAIL_SYNC_QUERY = "newer_than:90d";
export const GMAIL_MAX_MESSAGES = 300;
const GMAIL_PAGE_SIZE = 100;

// narrow view of gmail.users.messages so tests can stub it without googleapis
export interface GmailMessagesClient {
  list(params: {
    userId: string;
    q: string;
    maxResults: number;
    pageToken?: string;
  }): Promise<{ data: gmail_v1.Schema$ListMessagesResponse }>;
  get(params: {
    userId: string;
    id: string;
    format: "full";
  }): Promise<{ data: gmail_v1.Schema$Message }>;
}

function headerValue(
  part: gmail_v1.Schema$MessagePart | undefined,
  name: string,
): string {
  const lower = name.toLowerCase();
  const header = part?.headers?.find((h) => h.name?.toLowerCase() === lower);
  return header?.value?.trim() ?? "";
}

function decodeBody(data: string): string {
  return Buffer.from(data, "base64url").toString("utf8");
}

function findPartBody(
  part: gmail_v1.Schema$MessagePart | undefined,
  mimeType: string,
): string | null {
  if (!part) return null;
  if (part.mimeType === mimeType && part.body?.data && !part.filename) {
    return decodeBody(part.body.data);
  }
  for (const child of part.parts ?? []) {
    const found = findPartBody(child, mimeType);
    if (found !== null) return found;
  }
  return null;
}

function htmlToText(html: string): string {
  return html
    .replace(/<(style|script)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/p>|<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
}

export function extractGmailBody(message: gmail_v1.Schema$Message): string {
  const plain = findPartBody(message.payload, "text/plain");
  if (plain !== null && plain.trim().length > 0) return plain.trim();
  const html = findPartBody(message.payload, "text/html");
  if (html !== null) return htmlToText(html);
  return message.snippet?.trim() ?? "";
}

export function gmailMessageUrl(messageId: string): string {
  return `https://mail.google.com/mail/u/0/#inbox/${messageId}`;
}

export function gmailMessageToDoc(
  message: gmail_v1.Schema$Message,
): SyncedDoc | null {
  const id = message.id;
  if (!id) return null;

  const subject = headerValue(message.payload, "Subject");
  const from = headerValue(message.payload, "From");
  const date = headerValue(message.payload, "Date");
  const snippet = message.snippet?.trim() ?? "";
  const body = extractGmailBody(message);

  const lines = [
    `Subject: ${subject || "(no subject)"}`,
    from ? `From: ${from}` : null,
    date ? `Date: ${date}` : null,
    snippet && snippet !== body ? `Snippet: ${snippet}` : null,
    "",
    body,
  ].filter((line) => line !== null);

  return {
    title: subject || "(no subject)",
    content: lines.join("\n").slice(0, EMBED_CONTENT_CAP),
    sourceType: "gmail",
    sourceId: id,
    sourceUrl: gmailMessageUrl(id),
  };
}

export function createGmailPageFetcher(
  client: GmailMessagesClient,
): (cursor: string | undefined) => Promise<ConnectorPage> {
  let listed = 0;
  return async (cursor) => {
    const listResponse = await client.list({
      userId: "me",
      q: GMAIL_SYNC_QUERY,
      maxResults: Math.min(GMAIL_PAGE_SIZE, GMAIL_MAX_MESSAGES - listed),
      pageToken: cursor,
    });

    const refs = (listResponse.data.messages ?? []).slice(
      0,
      GMAIL_MAX_MESSAGES - listed,
    );
    listed += refs.length;

    const docs = await mapSyncedDocs(refs, {
      label: "message",
      identify: (ref) => ref.id ?? "unknown",
      toDoc: async (ref) => {
        if (!ref.id) return null;
        const messageResponse = await client.get({
          userId: "me",
          id: ref.id,
          format: "full",
        });
        return gmailMessageToDoc(messageResponse.data);
      },
    });

    const nextPageToken = listResponse.data.nextPageToken ?? undefined;
    return {
      docs,
      found: refs.length,
      nextCursor: listed < GMAIL_MAX_MESSAGES ? nextPageToken : undefined,
    };
  };
}

export async function runGmailSync(
  ctx: ActionCtx,
  args: GmailSyncArgs,
): Promise<{ synced: number }> {
  const oauth = new googleAuth.OAuth2();
  oauth.setCredentials({ access_token: args.accessToken });
  const gmail = gmailApi({ version: "v1", auth: oauth });

  const client: GmailMessagesClient = {
    list: (params) => gmail.users.messages.list(params),
    get: (params) => gmail.users.messages.get(params),
  };

  return runPaginatedConnectorSync(ctx, {
    clerkId: args.clerkId,
    connectorId: args.connectorId,
    label: "Gmail",
    fetchPage: createGmailPageFetcher(client),
  });
}
