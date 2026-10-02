import { z } from "zod";
import type { ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import {
  EMBED_CONTENT_CAP,
  mapSyncedDocs,
  runPaginatedConnectorSync,
  type ConnectorPage,
  type SyncedDoc,
} from "./syncShared";

export interface FigmaSyncArgs {
  clerkId: string;
  connectorId: Id<"connectors">;
  accessToken: string;
}

const FIGMA_API_BASE = "https://api.figma.com";
// figma file endpoints are tightly rate limited, keep the per sync volume small
export const FIGMA_MAX_FILES = 50;
const FIGMA_FILES_PER_PAGE = 10;

const figmaMeSchema = z.object({ id: z.string(), handle: z.string() });

const figmaTeamFoldersSchema = z.object({
  folders: z.array(z.object({ id: z.string(), name: z.string() })),
});

const figmaFolderFilesSchema = z.object({
  files: z.array(
    z.object({
      key: z.string(),
      name: z.string(),
      last_modified: z.string().optional(),
    }),
  ),
});

const figmaFileSchema = z.object({
  name: z.string(),
  lastModified: z.string().optional(),
  document: z
    .object({
      children: z
        .array(z.object({ name: z.string(), type: z.string().optional() }))
        .optional(),
    })
    .optional(),
});

const figmaCommentSchema = z.object({
  id: z.string(),
  message: z.string(),
  created_at: z.string().optional(),
  resolved_at: z.string().nullable().optional(),
  parent_id: z.string().optional(),
  user: z.object({ handle: z.string() }).optional(),
});

const figmaCommentsSchema = z.object({
  comments: z.array(figmaCommentSchema),
});

type FigmaFile = z.infer<typeof figmaFileSchema>;
type FigmaComment = z.infer<typeof figmaCommentSchema>;

export interface FigmaFileRef {
  key: string;
  name: string;
  folderName: string;
  lastModified: string;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface FigmaApi {
  get<T>(path: string, schema: z.ZodType<T>): Promise<T>;
}

export function createFigmaApi(
  accessToken: string,
  fetchImpl: FetchLike = fetch,
): FigmaApi {
  return {
    async get(path, schema) {
      const response = await fetchImpl(`${FIGMA_API_BASE}${path}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) {
        throw new Error(`Figma ${path} failed with ${response.status}`);
      }
      return schema.parse(await response.json());
    },
  };
}

// figma cannot list a user's teams over the api, so teams come from deployment config
export function parseFigmaTeamIds(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
}

function errorReason(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function discoverFigmaFiles(
  api: FigmaApi,
  teamIds: string[],
): Promise<FigmaFileRef[]> {
  const files: FigmaFileRef[] = [];

  for (const teamId of teamIds) {
    let folders: z.infer<typeof figmaTeamFoldersSchema>["folders"];
    try {
      ({ folders } = await api.get(
        `/v2/teams/${encodeURIComponent(teamId)}/folders`,
        figmaTeamFoldersSchema,
      ));
    } catch (err) {
      console.error(`Skipping Figma team ${teamId}: ${errorReason(err)}`);
      continue;
    }

    for (const folder of folders) {
      try {
        const listing = await api.get(
          `/v2/folders/${encodeURIComponent(folder.id)}/files`,
          figmaFolderFilesSchema,
        );
        for (const file of listing.files) {
          files.push({
            key: file.key,
            name: file.name,
            folderName: folder.name,
            lastModified: file.last_modified ?? "",
          });
        }
      } catch (err) {
        console.error(
          `Skipping Figma folder ${folder.id}: ${errorReason(err)}`,
        );
      }
    }
  }

  const unique = new Map(files.map((file) => [file.key, file]));
  return [...unique.values()]
    .sort((a, b) => b.lastModified.localeCompare(a.lastModified))
    .slice(0, FIGMA_MAX_FILES);
}

export function figmaFileUrl(fileKey: string): string {
  return `https://www.figma.com/file/${fileKey}`;
}

export function figmaFileToDoc(
  ref: FigmaFileRef,
  file: FigmaFile,
  comments: FigmaComment[],
): SyncedDoc {
  const title = file.name || ref.name;
  const pages = (file.document?.children ?? []).map((page) => page.name);
  const lastModified = file.lastModified ?? ref.lastModified;

  const lines = [`Figma file: ${title}`, `Folder: ${ref.folderName}`];
  if (lastModified) lines.push(`Last modified: ${lastModified}`);
  if (pages.length > 0) {
    lines.push("", "Pages:", ...pages.map((name) => `- ${name}`));
  }
  if (comments.length > 0) {
    lines.push("", "Comments:");
    for (const comment of comments) {
      const author = comment.user?.handle ?? "Unknown";
      const reply = comment.parent_id ? "  ↳ " : "- ";
      const resolved = comment.resolved_at ? " (resolved)" : "";
      lines.push(`${reply}${author}${resolved}: ${comment.message.trim()}`);
    }
  }

  return {
    title,
    content: lines.join("\n").slice(0, EMBED_CONTENT_CAP),
    sourceType: "figma",
    sourceId: ref.key,
    sourceUrl: figmaFileUrl(ref.key),
  };
}

async function figmaRefToDoc(
  api: FigmaApi,
  ref: FigmaFileRef,
): Promise<SyncedDoc> {
  const fileKey = encodeURIComponent(ref.key);
  const file = await api.get(`/v1/files/${fileKey}?depth=1`, figmaFileSchema);

  // comments are optional context, a failed comment fetch keeps the file doc
  let comments: FigmaComment[] = [];
  try {
    ({ comments } = await api.get(
      `/v1/files/${fileKey}/comments?as_md=true`,
      figmaCommentsSchema,
    ));
  } catch (err) {
    console.error(
      `Failed to load Figma comments for ${ref.key}: ${errorReason(err)}`,
    );
  }

  return figmaFileToDoc(ref, file, comments);
}

export function createFigmaPageFetcher(
  api: FigmaApi,
  teamIds: string[],
): (cursor: string | undefined) => Promise<ConnectorPage> {
  let files: FigmaFileRef[] | null = null;

  return async (cursor) => {
    if (files === null) {
      // fails fast on a revoked or expired token before any discovery
      await api.get("/v1/me", figmaMeSchema);
      if (teamIds.length === 0) {
        console.warn("FIGMA_TEAM_IDS is not set, no Figma files to sync");
      }
      files = await discoverFigmaFiles(api, teamIds);
    }

    const offset = cursor ? Number(cursor) : 0;
    const page = files.slice(offset, offset + FIGMA_FILES_PER_PAGE);
    const nextOffset = offset + FIGMA_FILES_PER_PAGE;

    const docs = await mapSyncedDocs(page, {
      label: "file",
      identify: (ref) => ref.key,
      toDoc: (ref) => figmaRefToDoc(api, ref),
    });

    return {
      docs,
      found: page.length,
      nextCursor: nextOffset < files.length ? String(nextOffset) : undefined,
    };
  };
}

export async function runFigmaSync(
  ctx: ActionCtx,
  args: FigmaSyncArgs,
): Promise<{ synced: number }> {
  return runPaginatedConnectorSync(ctx, {
    clerkId: args.clerkId,
    connectorId: args.connectorId,
    label: "Figma",
    fetchPage: createFigmaPageFetcher(
      createFigmaApi(args.accessToken),
      parseFigmaTeamIds(process.env.FIGMA_TEAM_IDS),
    ),
  });
}
