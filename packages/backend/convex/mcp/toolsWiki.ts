import { z } from "zod";
import { internal } from "../_generated/api";
import {
  createWiki,
  toWikiGetResult,
  toWikiListItem,
  toWikiSearchItem,
  updateWiki,
} from "./wikiOps";
import { toolSpec } from "./toolTypes";

const wikiListSchema = z.object({});

const wikiGetSchema = z.object({
  id: z.string().describe("Wiki node id from wiki_list"),
});

const wikiSearchSchema = z.object({
  query: z.string().describe("Search text"),
});

const wikiCreateSchema = z.object({
  kind: z
    .enum(["folder", "document", "artifact"])
    .describe("folder, document, or artifact"),
  title: z.string().describe("Node title"),
  parentId: z
    .string()
    .optional()
    .describe("Parent folder id from wiki_list (omit for root)"),
  parentPath: z
    .string()
    .optional()
    .describe(
      'Ancestor folder path from wiki root, e.g. "Learning" or "Learning/my-topic". Missing folders are created automatically. Use instead of parentId when you know the path.',
    ),
  contentMarkdown: z
    .string()
    .optional()
    .describe(
      "Initial body: markdown for documents, raw source for artifacts (omit for folders)",
    ),
  language: z
    .string()
    .optional()
    .describe(
      'Artifact language hint, e.g. "html", "svg", "tsx", "sql" (artifacts only; defaults to html)',
    ),
  sourceCodebaseId: z
    .string()
    .optional()
    .describe(
      "On a folder: link it to a synced codebase (id from codebases_list). Set on the root folder of a generated codebase knowledge base.",
    ),
});

const wikiUpdateSchema = z.object({
  id: z.string().describe("Wiki node id from wiki_list"),
  title: z.string().optional().describe("New title"),
  contentMarkdown: z
    .string()
    .optional()
    .describe(
      "Body to write or append (markdown for documents, raw source for artifacts)",
    ),
  contentMode: z
    .enum(["replace", "append"])
    .optional()
    .describe("replace (default) or append when contentMarkdown is set"),
  language: z
    .string()
    .optional()
    .describe('Artifact language hint, e.g. "html" or "svg" (artifacts only)'),
});

const wikiDeleteSchema = z.object({
  id: z.string().describe("Wiki node id from wiki_list"),
});

export const wikiToolSpecs = {
  wiki_list: toolSpec({
    name: "wiki_list",
    schema: wikiListSchema,
    description:
      "List all wiki folders, documents, and artifacts (flat index, no body). Use returned ids with wiki_get. Call this before wiki_get or wiki_update when you do not already have a node id.",
    errorLabel: "Wiki list failed",
    scopes: ["personal"],
    async run(h): Promise<unknown> {
      const rows = await h.ctx.runQuery(internal.wiki.listByClerkIdInternal, {
        clerkId: h.clerkUserId,
      });
      return rows.map(toWikiListItem);
    },
  }),
  wiki_get: toolSpec({
    name: "wiki_get",
    schema: wikiGetSchema,
    description:
      "Fetch a single wiki node by id. Returns metadata and contentMarkdown for documents and artifacts. Call wiki_list first if you do not have the id.",
    errorLabel: "Wiki get failed",
    scopes: ["personal"],
    async run(h, params): Promise<unknown> {
      const node = await h.ctx.runQuery(internal.wiki.getByIdInternal, {
        clerkId: h.clerkUserId,
        id: params.id,
      });
      if (!node) {
        throw new Error("Wiki node not found");
      }
      return toWikiGetResult(node);
    },
  }),
  wiki_search: toolSpec({
    name: "wiki_search",
    schema: wikiSearchSchema,
    description:
      "Full-text search wiki titles and document/artifact bodies. Returns id, title, kind, and excerpt.",
    errorLabel: "Wiki search failed",
    scopes: ["personal"],
    async run(h, params): Promise<unknown> {
      const rows = await h.ctx.runQuery(internal.wiki.searchByClerkIdInternal, {
        clerkId: h.clerkUserId,
        queryText: params.query,
      });
      return rows.map(toWikiSearchItem);
    },
  }),
  wiki_create: toolSpec({
    name: "wiki_create",
    schema: wikiCreateSchema,
    description:
      'Create a wiki folder, document, or artifact. Documents store contentMarkdown as canonical markdown (same as the web editor). Artifacts store raw source in contentMarkdown with optional language (e.g. "html", "svg"). Optional parentId must be a folder id from wiki_list.',
    errorLabel: "Wiki create failed",
    scopes: ["personal"],
    async run(h, params): Promise<unknown> {
      return createWiki(h.ctx, {
        clerkId: h.clerkUserId,
        kind: params.kind,
        title: params.title,
        parentId: params.parentId,
        parentPath: params.parentPath,
        contentMarkdown: params.contentMarkdown,
        language: params.language,
        sourceCodebaseId: params.sourceCodebaseId,
      });
    },
  }),
  wiki_update: toolSpec({
    name: "wiki_update",
    schema: wikiUpdateSchema,
    description:
      "Update a wiki node by id. Optional title and/or contentMarkdown (and language for artifacts). contentMode append concatenates after the existing body; replace (default) overwrites the body.",
    errorLabel: "Wiki update failed",
    scopes: ["personal"],
    async run(h, params): Promise<unknown> {
      return updateWiki(h.ctx, {
        clerkId: h.clerkUserId,
        id: params.id,
        title: params.title,
        contentMarkdown: params.contentMarkdown,
        contentMode: params.contentMode,
        language: params.language,
      });
    },
  }),
  wiki_delete: toolSpec({
    name: "wiki_delete",
    schema: wikiDeleteSchema,
    description:
      "Permanently delete a wiki folder, document, or artifact by id. Deleting a folder removes all descendants. Call wiki_list or wiki_get first to confirm the id.",
    errorLabel: "Wiki delete failed",
    scopes: ["personal"],
    async run(h, params): Promise<unknown> {
      const deletedCount = await h.ctx.runMutation(
        internal.wiki.deleteByClerkIdInternal,
        { clerkId: h.clerkUserId, id: params.id },
      );
      return { deletedCount };
    },
  }),
};
