import { describe, expect, it } from "vitest";
import { z } from "zod";
import { internal } from "../../convex/_generated/api";
import {
  createConvexBackend,
  mcpCaller,
  signUp,
  type McpCaller,
} from "./convexHarness";

const ALICE = "clerk_files_alice";
const BOB = "clerk_files_bob";

const fileListSchema = z.object({
  items: z.array(
    z.object({
      path: z.string(),
      kind: z.enum(["file", "folder"]),
      size: z.number().nullable(),
      indexStatus: z.string().nullable(),
      memoryId: z.string().nullable(),
    }),
  ),
  totalBytes: z.number(),
  storageLimit: z.number(),
});
const teamCreatedSchema = z.object({ teamId: z.string() });

async function listPaths(caller: McpCaller, path?: string): Promise<string[]> {
  const listed = fileListSchema.parse(
    await caller.call("files_list", path === undefined ? {} : { path }),
  );
  return listed.items.map((item) => item.path).sort();
}

function upload(caller: McpCaller, path: string, text: string) {
  return caller.call("files_upload", {
    path,
    contentBase64: Buffer.from(text).toString("base64"),
    mimeType: "application/octet-stream",
  });
}

describe("MCP files parity tools (convex-test backend)", () => {
  it("creates folders, renames and moves inside the caller's drive", async () => {
    const t = createConvexBackend();
    await signUp(t, ALICE, "alice@example.com");
    await signUp(t, BOB, "bob@example.com");
    const alice = mcpCaller(t, ALICE);
    const bob = mcpCaller(t, BOB);

    expect(
      await alice.call("files_create_folder", { path: "projects/2026" }),
    ).toEqual({ path: "projects/2026", kind: "folder", created: true });
    expect(
      await alice.call("files_create_folder", { path: "projects/2026" }),
    ).toMatchObject({ created: false });
    await upload(alice, "inbox/a.bin", "aaaa");
    await upload(alice, "inbox/b.bin", "bb");

    const listed = fileListSchema.parse(await alice.call("files_list"));
    expect(listed.totalBytes).toBe(6);
    expect(listed.storageLimit).toBeGreaterThan(0);
    expect(listed.items.find((item) => item.path === "inbox/a.bin")).toEqual(
      expect.objectContaining({ indexStatus: "skipped", memoryId: null }),
    );

    expect(
      await alice.call("files_rename", {
        path: "inbox/a.bin",
        newName: "renamed.bin",
      }),
    ).toEqual({ path: "inbox/renamed.bin", previousPath: "inbox/a.bin" });
    await expect(
      alice.call("files_rename", { path: "inbox/b.bin", newName: "x/y" }),
    ).rejects.toThrow(/without '\/'/);
    await expect(
      alice.call("files_rename", {
        path: "inbox/b.bin",
        newName: "renamed.bin",
      }),
    ).rejects.toThrow(/already exists/);

    expect(
      await alice.call("files_move", {
        paths: ["inbox/renamed.bin", "inbox/b.bin"],
        targetFolderPath: "projects/2026",
      }),
    ).toEqual({
      moved: [
        { from: "inbox/renamed.bin", to: "projects/2026/renamed.bin" },
        { from: "inbox/b.bin", to: "projects/2026/b.bin" },
      ],
    });
    await expect(
      alice.call("files_move", {
        paths: ["projects"],
        targetFolderPath: "projects/2026",
      }),
    ).rejects.toThrow(/own descendant/);
    expect(await listPaths(alice, "projects/2026")).toEqual([
      "projects/2026/b.bin",
      "projects/2026/renamed.bin",
    ]);

    // bob resolves paths in his own drive only
    expect(await listPaths(bob)).toEqual([]);
    await expect(
      bob.call("files_rename", {
        path: "projects/2026/b.bin",
        newName: "stolen.bin",
      }),
    ).rejects.toThrow(/Path not found/);
    await expect(
      bob.call("files_move", { paths: ["projects"] }),
    ).rejects.toThrow(/Path not found/);

    // and the internals refuse alice's node ids
    const aliceNodes = await t.query(internal.files.listByClerkIdInternal, {
      clerkId: ALICE,
      scope: "personal",
    });
    const node = aliceNodes.nodes.find((row) => row.name === "b.bin");
    if (node === undefined) throw new Error("expected b.bin");
    await expect(
      t.mutation(internal.files.renameByClerkIdInternal, {
        clerkId: BOB,
        scope: "personal",
        nodeId: node._id,
        name: "stolen.bin",
      }),
    ).rejects.toThrow(/Not found/);
    await expect(
      t.mutation(internal.files.moveByClerkIdInternal, {
        clerkId: BOB,
        scope: "personal",
        nodeIds: [node._id],
      }),
    ).rejects.toThrow(/Not found/);
    await expect(
      t.mutation(internal.files.deleteByIdForClerkInternal, {
        clerkId: BOB,
        scope: "personal",
        nodeId: node._id,
      }),
    ).rejects.toThrow(/Not found/);
    expect(await listPaths(alice, "projects/2026")).toContain(
      "projects/2026/b.bin",
    );
  });

  it("team connector files use the active team's drive and its members only", async () => {
    const t = createConvexBackend();
    await signUp(t, ALICE, "alice@example.com");
    await signUp(t, BOB, "bob@example.com");
    const alicePersonal = mcpCaller(t, ALICE);
    const aliceTeam = mcpCaller(t, ALICE, "team");
    const bobTeam = mcpCaller(t, BOB, "team");

    await expect(aliceTeam.call("files_list")).rejects.toThrow(
      /No team profiles available/,
    );
    const { teamId } = teamCreatedSchema.parse(
      await alicePersonal.call("teams_create", { name: "Crew" }),
    );

    await upload(aliceTeam, "shared/plan.bin", "plan");
    await upload(alicePersonal, "mine.bin", "mine");
    expect(await listPaths(aliceTeam)).toEqual(["shared", "shared/plan.bin"]);
    expect(await listPaths(alicePersonal)).toEqual(["mine.bin"]);

    // bob is not a member yet: no team drive at all
    await expect(bobTeam.call("files_list")).rejects.toThrow(
      /No team profiles available/,
    );

    await alicePersonal.call("teams_add_member", {
      teamId,
      email: "bob@example.com",
    });
    expect(await listPaths(bobTeam)).toEqual(["shared", "shared/plan.bin"]);
    await bobTeam.call("files_rename", {
      path: "shared/plan.bin",
      newName: "plan-v2.bin",
    });
    // members edit team files, but only the creator or an owner deletes them
    await expect(
      bobTeam.call("files_delete", { path: "shared/plan-v2.bin" }),
    ).rejects.toThrow(/creator or a team owner/);
    expect(
      await aliceTeam.call("files_delete", { path: "shared" }),
    ).toMatchObject({ path: "shared", deletedCount: 2 });
    expect(await listPaths(alicePersonal)).toEqual(["mine.bin"]);
  });
});
