import { describe, expect, it, vi } from "vitest";
import type { gmail_v1 } from "@googleapis/gmail";
import {
  createGmailPageFetcher,
  GMAIL_MAX_MESSAGES,
  GMAIL_SYNC_QUERY,
  gmailMessageToDoc,
  type GmailMessagesClient,
} from "../../convex/connectors/gmail";
import { runPaginatedConnectorSync } from "../../convex/connectors/syncShared";
import {
  createFakeSyncCtx,
  docIds,
  TEST_CLERK_ID,
  TEST_CONNECTOR_ID,
} from "./helpers";

function b64(text: string): string {
  return Buffer.from(text, "utf8").toString("base64url");
}

function message(
  id: string,
  opts: { subject?: string; body?: string; html?: string } = {},
): gmail_v1.Schema$Message {
  const parts: gmail_v1.Schema$MessagePart[] = [];
  if (opts.body !== undefined) {
    parts.push({ mimeType: "text/plain", body: { data: b64(opts.body) } });
  }
  if (opts.html !== undefined) {
    parts.push({ mimeType: "text/html", body: { data: b64(opts.html) } });
  }
  return {
    id,
    threadId: `thread-${id}`,
    snippet: `snippet ${id}`,
    payload: {
      mimeType: "multipart/alternative",
      headers: [
        { name: "Subject", value: opts.subject ?? `Subject ${id}` },
        { name: "From", value: "Ada <ada@example.com>" },
        { name: "Date", value: "Mon, 01 Sep 2026 09:00:00 +0000" },
      ],
      parts,
    },
  };
}

function fakeGmailClient(
  pages: Array<{ ids: string[]; next?: string }>,
  messages: Map<string, gmail_v1.Schema$Message>,
  failIds: Set<string> = new Set(),
) {
  const listCalls: Array<Parameters<GmailMessagesClient["list"]>[0]> = [];
  const client: GmailMessagesClient = {
    list: async (params) => {
      listCalls.push(params);
      const index = params.pageToken ? Number(params.pageToken) : 0;
      const page = pages[index] ?? { ids: [] };
      return {
        data: {
          messages: page.ids.map((id) => ({ id })),
          nextPageToken: page.next ?? null,
        },
      };
    },
    get: async ({ id }) => {
      if (failIds.has(id)) throw new Error(`boom ${id}`);
      const found = messages.get(id);
      if (!found) throw new Error(`missing ${id}`);
      return { data: found };
    },
  };
  return { client, listCalls };
}

describe("gmailMessageToDoc", () => {
  it("maps subject, sender, date, and plain body", () => {
    const doc = gmailMessageToDoc(
      message("m1", { subject: "Launch plan", body: "Ship on Friday." }),
    );
    expect(doc).toEqual({
      title: "Launch plan",
      content: expect.stringContaining("Ship on Friday."),
      sourceType: "gmail",
      sourceId: "m1",
      sourceUrl: "https://mail.google.com/mail/u/0/#inbox/m1",
    });
    expect(doc?.content).toContain("From: Ada <ada@example.com>");
    expect(doc?.content).toContain("Date: Mon, 01 Sep 2026");
    expect(doc?.content).toContain("Subject: Launch plan");
  });

  it("falls back to stripped html, then snippet", () => {
    const html = gmailMessageToDoc(
      message("m2", { html: "<p>Hello <b>team</b></p><style>x{}</style>" }),
    );
    expect(html?.content).toContain("Hello team");
    expect(html?.content).not.toContain("<b>");

    const snippetOnly = gmailMessageToDoc(message("m3"));
    expect(snippetOnly?.content).toContain("snippet m3");
  });

  it("skips messages without an id", () => {
    expect(gmailMessageToDoc({ snippet: "no id" })).toBeNull();
  });
});

describe("createGmailPageFetcher", () => {
  it("lists recent mail and follows page tokens", async () => {
    const messages = new Map(
      ["a", "b", "c"].map((id) => [id, message(id, { body: `body ${id}` })]),
    );
    const { client, listCalls } = fakeGmailClient(
      [{ ids: ["a", "b"], next: "1" }, { ids: ["c"] }],
      messages,
    );
    const fetchPage = createGmailPageFetcher(client);

    const first = await fetchPage(undefined);
    expect(docIds(first.docs)).toEqual(["a", "b"]);
    expect(first.nextCursor).toBe("1");
    expect(listCalls[0]).toMatchObject({
      userId: "me",
      q: GMAIL_SYNC_QUERY,
      maxResults: 100,
    });

    const second = await fetchPage(first.nextCursor);
    expect(docIds(second.docs)).toEqual(["c"]);
    expect(second.nextCursor).toBeUndefined();
  });

  it("stops at the message cap even when gmail has more pages", async () => {
    const ids = Array.from(
      { length: GMAIL_MAX_MESSAGES + 50 },
      (_, i) => `m${i}`,
    );
    const messages = new Map(ids.map((id) => [id, message(id)]));
    const pages = [];
    for (let i = 0; i < ids.length; i += 100) {
      pages.push({
        ids: ids.slice(i, i + 100),
        next: String(pages.length + 1),
      });
    }
    const { client, listCalls } = fakeGmailClient(pages, messages);
    const fetchPage = createGmailPageFetcher(client);

    let cursor: string | undefined;
    let total = 0;
    do {
      const page = await fetchPage(cursor);
      total += page.docs.length;
      cursor = page.nextCursor;
    } while (cursor);

    expect(total).toBe(GMAIL_MAX_MESSAGES);
    expect(listCalls).toHaveLength(GMAIL_MAX_MESSAGES / 100);
  });

  it("keeps syncing when one message fails to load", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const messages = new Map(["ok1", "ok2"].map((id) => [id, message(id)]));
    const { client } = fakeGmailClient(
      [{ ids: ["ok1", "bad", "ok2"] }],
      messages,
      new Set(["bad"]),
    );

    const page = await createGmailPageFetcher(client)(undefined);
    expect(docIds(page.docs)).toEqual(["ok1", "ok2"]);
    expect(page.found).toBe(3);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("bad"));
    errorSpy.mockRestore();
  });
});

describe("gmail sync through runPaginatedConnectorSync", () => {
  it("upserts each message as a gmail memory and completes", async () => {
    const messages = new Map(
      ["x", "y"].map((id) => [id, message(id, { body: `body ${id}` })]),
    );
    const { client } = fakeGmailClient(
      [{ ids: ["x"], next: "1" }, { ids: ["y"] }],
      messages,
    );
    const fake = createFakeSyncCtx();

    const result = await runPaginatedConnectorSync(fake.ctx, {
      clerkId: TEST_CLERK_ID,
      connectorId: TEST_CONNECTOR_ID,
      label: "Gmail",
      fetchPage: createGmailPageFetcher(client),
    });

    expect(result).toEqual({ synced: 2 });
    expect(fake.upserted()).toEqual([
      expect.objectContaining({
        userId: TEST_CLERK_ID,
        profileId: "profile_default",
        sourceType: "gmail",
        sourceId: "x",
      }),
      expect.objectContaining({ sourceType: "gmail", sourceId: "y" }),
    ]);
    expect(fake.mutations.at(-1)?.args).toMatchObject({
      syncStatus: "idle",
      syncProgress: 100,
      itemsSynced: 2,
    });
  });
});
