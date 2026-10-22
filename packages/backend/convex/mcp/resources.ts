import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { scheduleMcpTrace } from "../mcpTraces";
import type { McpScope } from "../profiles/mcpAccess";
import type { EffectiveSkill, SkillIndexSlice } from "../skills";
import { buildResourceTrace, resourceTraceTool } from "./traceSummary";

export const CONTEXT_PROMPT_URI = "vmem://context_prompt";
export const SKILL_RESOURCE_URI_PREFIX = "vmem://skills/";

export type SkillResourceDescriptor = {
  name: string;
  uri: string;
  title: string;
  description: string;
  mimeType: "text/markdown";
};

export function skillResourceUri(skillName: string): string {
  return `${SKILL_RESOURCE_URI_PREFIX}${encodeURIComponent(skillName)}`;
}

export function parseSkillResourceName(uri: string): string | null {
  if (!uri.startsWith(SKILL_RESOURCE_URI_PREFIX)) return null;
  try {
    return decodeURIComponent(uri.slice(SKILL_RESOURCE_URI_PREFIX.length));
  } catch {
    return null;
  }
}

export function skillResourceName(skillName: string): string {
  const slug = skillName.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "");
  return `skill_${slug.length > 0 ? slug : "unnamed"}`;
}

export function formatSkillResourceMarkdown(skill: {
  name: string;
  description: string;
  instructions: string;
}): string {
  return [
    "---",
    `name: ${JSON.stringify(skill.name)}`,
    `description: ${JSON.stringify(skill.description)}`,
    `uri: ${JSON.stringify(skillResourceUri(skill.name))}`,
    "---",
    "",
    skill.instructions,
  ].join("\n");
}

export function skillResourceDescriptors(
  skills: readonly SkillIndexSlice[],
): SkillResourceDescriptor[] {
  return skills.map((skill) => ({
    name: skillResourceName(skill.name),
    uri: skillResourceUri(skill.name),
    title: skill.name,
    description: skill.description,
    mimeType: "text/markdown",
  }));
}

export function listedMcpResourceUris(
  scope: McpScope,
  skills: readonly SkillIndexSlice[],
): string[] {
  const uris: string[] = [];
  if (scope !== "team") uris.push(CONTEXT_PROMPT_URI);
  for (const skill of skills) {
    uris.push(skillResourceUri(skill.name));
  }
  return uris;
}

type ResourceTraceContext = {
  ctx: ActionCtx;
  clerkUserId: string;
  scope: McpScope;
};

function traceResourceRead(
  t: ResourceTraceContext,
  uri: string,
  startedAt: number,
  outcome: { ok: true; text: string } | { ok: false; error: string },
): Promise<void> {
  return scheduleMcpTrace(
    t.ctx,
    {
      clerkUserId: t.clerkUserId,
      scope: t.scope,
      tool: resourceTraceTool(uri),
      ok: outcome.ok,
      startedAt,
    },
    () => buildResourceTrace(uri, outcome),
  );
}

function registerSkillResource(
  server: McpServer,
  skill: EffectiveSkill,
  t: ResourceTraceContext,
): void {
  const uri = skillResourceUri(skill.name);
  server.registerResource(
    skillResourceName(skill.name),
    uri,
    {
      title: skill.name,
      description: skill.description,
      mimeType: "text/markdown",
    },
    async (resourceUri) => {
      const startedAt = Date.now();
      const text = formatSkillResourceMarkdown(skill);
      await traceResourceRead(t, uri, startedAt, { ok: true, text });
      return {
        contents: [
          { uri: resourceUri.toString(), text, mimeType: "text/markdown" },
        ],
      };
    },
  );
}

export async function registerResources(
  server: McpServer,
  clerkUserId: string,
  ctx: ActionCtx,
  scope: McpScope,
): Promise<void> {
  const t: ResourceTraceContext = { ctx, clerkUserId, scope };
  if (scope !== "team") {
    server.registerResource(
      "context_prompt",
      CONTEXT_PROMPT_URI,
      {
        title: "User Profile",
        description:
          "Synthesized user profile (about + preferences + pinned memories + recent activity summary + installed skills). Also available via the context_prompt_get tool when the host cannot re-read this resource mid-chat.",
        mimeType: "text/markdown",
      },
      async (uri) => {
        const startedAt = Date.now();
        let text: string;
        let outcome: { ok: true; text: string } | { ok: false; error: string };
        try {
          const result = await ctx.runAction(
            internal.contextPromptApi.mcpGetContextPrompt,
            { clerkId: clerkUserId },
          );
          text = result.content;
          outcome = { ok: true, text };
        } catch (err) {
          const message = err instanceof Error ? err.message : "unknown error";
          console.error("[MCP][context_prompt] regenerate failed:", message);
          text = `# vmem User Profile\n\n_Profile temporarily unavailable._`;
          outcome = { ok: false, error: message };
        }
        await traceResourceRead(t, CONTEXT_PROMPT_URI, startedAt, outcome);
        return {
          contents: [
            {
              uri: uri.toString(),
              text,
              mimeType: "text/markdown",
            },
          ],
        };
      },
    );
  }

  try {
    const skills: EffectiveSkill[] = await ctx.runQuery(
      internal.skills.listEffectiveByClerkIdInternal,
      { clerkId: clerkUserId, scope },
    );
    for (const skill of skills) {
      registerSkillResource(server, skill, t);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error("[MCP][skills resources] list failed:", message);
  }
}
