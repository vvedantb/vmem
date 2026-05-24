/**
 * End-to-end vmem MCP tool tester (3 rounds × 21 tools).
 * Uses mcp-remote OAuth token from ~/.mcp-auth (same as Cursor).
 *
 * Usage: node scripts/test-vmem-mcp.mjs
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const MCP_URL =
  process.env.VMEM_MCP_URL ??
  "https://outgoing-reindeer-268.eu-west-1.convex.site/mcp";

const ROUNDS = [
  {
    name: "Round 1 — onboarding & memory",
    memorySearchQuery: "Neo4j memory graph",
    memoryRetrieveQuery: "How does hybrid memory retrieval work in vmem?",
    codebaseSearchQuery: "syncCodebase",
    impactDirection: "downstream",
    graphKinds: ["code-function"],
  },
  {
    name: "Round 2 — profiles & skills",
    memorySearchQuery: "FYP project context",
    memoryRetrieveQuery: "What do I prefer for UI design?",
    codebaseSearchQuery: "searchSymbolsInternal",
    impactDirection: "upstream",
    graphKinds: ["code-process"],
  },
  {
    name: "Round 3 — codebase exploration",
    memorySearchQuery: "Convex workflow",
    memoryRetrieveQuery: "codebase sync cron schedule",
    codebaseSearchQuery: "crons",
    impactDirection: "downstream",
    graphKinds: ["code-file", "code-function"],
  },
];

function loadAccessToken() {
  const hash = crypto.createHash("md5").update(MCP_URL).digest("hex");
  const tokenPath = path.join(
    process.env.USERPROFILE ?? process.env.HOME ?? "",
    ".mcp-auth",
    "mcp-remote-0.1.37",
    `${hash}_tokens.json`,
  );
  const raw = JSON.parse(fs.readFileSync(tokenPath, "utf8"));
  if (!raw.access_token) throw new Error("No access_token in mcp-remote store");
  return raw.access_token;
}

async function createSession(accessToken) {
  const init = await fetch(MCP_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "vmem-mcp-e2e", version: "1.0.0" },
      },
    }),
  });
  const sessionId = init.headers.get("mcp-session-id");
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  if (sessionId) headers["mcp-session-id"] = sessionId;
  return headers;
}

async function callTool(headers, name, args) {
  const started = Date.now();
  const res = await fetch(MCP_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Math.floor(Math.random() * 1e9),
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });
  const ms = Date.now() - started;
  const text = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      tool: name,
      ok: false,
      ms,
      error: `Non-JSON response (${res.status}): ${text.slice(0, 200)}`,
    };
  }
  const result = parsed.result;
  if (!result) {
    return {
      tool: name,
      ok: false,
      ms,
      error: JSON.stringify(parsed.error ?? parsed).slice(0, 500),
    };
  }
  if (result.isError) {
    return {
      tool: name,
      ok: false,
      ms,
      error: result.content?.[0]?.text?.slice(0, 500) ?? "isError",
    };
  }
  let data;
  try {
    data = JSON.parse(result.content[0].text);
  } catch {
    data = result.content[0].text;
  }
  return { tool: name, ok: true, ms, data };
}

function summarize(data, max = 280) {
  const s = typeof data === "string" ? data : JSON.stringify(data);
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

async function runRound(headers, round, roundIndex) {
  const results = [];
  const log = (r, prompt) => {
    results.push({ ...r, prompt });
    const status = r.ok ? "PASS" : "FAIL";
    console.log(`  [${status}] ${r.tool} (${r.ms}ms)`);
    if (!r.ok) console.log(`         ${r.error}`);
  };

  console.log(`\n=== ${round.name} ===`);

  log(
    await callTool(headers, "ping", {}),
    "Is the vmem MCP server healthy?",
  );

  const whoami = await callTool(headers, "whoami", {});
  log(whoami, "Who am I and which profile is active?");
  const profileId =
    whoami.ok && whoami.data?.activeProfile?.id
      ? whoami.data.activeProfile.id
      : undefined;

  log(
    await callTool(headers, "list_profiles", {}),
    "List my profiles so I can pick where to save memories",
  );

  log(
    await callTool(headers, "memory_search", {
      query: round.memorySearchQuery,
      limit: 5,
    }),
    `Search memories about: ${round.memorySearchQuery}`,
  );

  log(
    await callTool(headers, "memory_retrieve", {
      query: round.memoryRetrieveQuery,
      limit: 3,
    }),
    `Retrieve relevant memories for: ${round.memoryRetrieveQuery}`,
  );

  const testTitle = `MCP E2E R${roundIndex + 1} ${Date.now()}`;
  const add = await callTool(headers, "memory_add", {
    title: testTitle,
    content: `Automated MCP test round ${roundIndex + 1}. Safe to delete.`,
    type: "episodic",
    source: "mcp-e2e",
    tags: ["mcp-e2e-test"],
    profileId,
  });
  log(add, `Remember that we ran MCP test round ${roundIndex + 1}`);

  let memoryId;
  if (add.ok && add.data?.id) memoryId = add.data.id;
  else if (add.ok && add.data?.memoryId) memoryId = add.data.memoryId;

  if (memoryId) {
    log(
      await callTool(headers, "memory_update", {
        id: memoryId,
        content: `Updated by MCP E2E round ${roundIndex + 1}.`,
        tags: ["mcp-e2e-test", "updated"],
      }),
      `Update the test memory with new content`,
    );
    log(
      await callTool(headers, "memory_delete", { id: memoryId }),
      `Delete the test memory we just created`,
    );
  } else {
    results.push({
      tool: "memory_update",
      ok: false,
      ms: 0,
      error: "Skipped: memory_add did not return id",
      prompt: "Update test memory",
    });
    results.push({
      tool: "memory_delete",
      ok: false,
      ms: 0,
      error: "Skipped: no memory id",
      prompt: "Delete test memory",
    });
  }

  const skillsList = await callTool(headers, "skills_list", {});
  log(skillsList, "What skills have I saved in vmem?");
  const skillName =
    skillsList.ok && Array.isArray(skillsList.data) && skillsList.data[0]?.name
      ? skillsList.data[0].name
      : "nonexistent-skill-mcp-test";

  log(
    await callTool(headers, "skills_get", { name: skillName }),
    `Show me the skill called "${skillName}"`,
  );

  const wikiList = await callTool(headers, "wiki_list", {});
  log(wikiList, "List my wiki folders and documents");

  const wikiTitle = `MCP E2E Wiki R${roundIndex + 1} ${Date.now()}`;
  const wikiCreate = await callTool(headers, "wiki_create", {
    kind: "document",
    title: wikiTitle,
    contentMarkdown: `# ${wikiTitle}\n\nRound ${roundIndex + 1} wiki body.`,
  });
  log(wikiCreate, `Create a wiki document for round ${roundIndex + 1}`);

  const wikiId =
    wikiCreate.ok && wikiCreate.data?.id ? wikiCreate.data.id : undefined;

  if (wikiId) {
    log(
      await callTool(headers, "wiki_get", { id: wikiId }),
      `Read the wiki document we just created`,
    );
    log(
      await callTool(headers, "wiki_search", { query: wikiTitle }),
      `Search wiki for "${wikiTitle}"`,
    );
    log(
      await callTool(headers, "wiki_update", {
        id: wikiId,
        contentMarkdown: `\n\nAppended in round ${roundIndex + 1}.`,
        contentMode: "append",
      }),
      `Append to the wiki document body`,
    );
  } else {
    for (const t of ["wiki_get", "wiki_search", "wiki_update"]) {
      results.push({
        tool: t,
        ok: false,
        ms: 0,
        error: "Skipped: wiki_create did not return id",
        prompt: t,
      });
    }
  }

  const codebases = await callTool(headers, "codebases_list", {});
  log(codebases, "Which GitHub repos are connected for codebase graph?");
  const vmemCb =
    codebases.ok && Array.isArray(codebases.data)
      ? codebases.data.find((c) => c.repoName === "vmem") ??
        codebases.data.find((c) => c.status === "synced")
      : null;
  const codebaseId = vmemCb?.id;

  if (!codebaseId) {
    for (const t of [
      "codebase_overview",
      "codebase_search",
      "codebase_context",
      "codebase_impact",
      "codebase_graph",
    ]) {
      results.push({
        tool: t,
        ok: false,
        ms: 0,
        error: "Skipped: no synced codebase",
        prompt: t,
      });
    }
    return results;
  }

  log(
    await callTool(headers, "codebase_overview", { codebaseId }),
    "Give me stats for my vmem codebase graph",
  );

  const search = await callTool(headers, "codebase_search", {
    codebaseId,
    query: round.codebaseSearchQuery,
    limit: 10,
  });
  log(
    search,
    `Find symbols related to "${round.codebaseSearchQuery}" in vmem`,
  );

  const symbolId =
    search.ok && search.data?.results?.[0]?.id
      ? search.data.results[0].id
      : search.ok && Array.isArray(search.data) && search.data[0]?.id
        ? search.data[0].id
        : undefined;

  if (symbolId) {
    log(
      await callTool(headers, "codebase_context", { codebaseId, symbolId }),
      `What calls this symbol and what does it call? (${symbolId})`,
    );
    log(
      await callTool(headers, "codebase_impact", {
        codebaseId,
        symbolId,
        direction: round.impactDirection,
        depth: 3,
      }),
      `Blast radius ${round.impactDirection} from ${symbolId}`,
    );
    log(
      await callTool(headers, "codebase_graph", {
        codebaseId,
        kinds: round.graphKinds,
        blastRadiusOf: symbolId,
        blastDirection: round.impactDirection,
        blastDepth: 2,
      }),
      `Show me a subgraph around ${symbolId}`,
    );
  } else {
    for (const t of ["codebase_context", "codebase_impact", "codebase_graph"]) {
      results.push({
        tool: t,
        ok: false,
        ms: 0,
        error: "Skipped: codebase_search returned no symbols",
        prompt: t,
      });
    }
  }

  return results;
}

function writeMarkdownReport(allRounds, meta) {
  const lines = [
    "# vmem MCP End-to-End Test Report",
    "",
    `Generated: ${meta.generatedAt}`,
    `MCP URL: \`${MCP_URL}\``,
    `Summary: **${meta.passed}/${meta.total} passed** across 3 rounds × 21 tools`,
    "",
    "## Fixes applied during this session",
    "",
    "- Neo4j `LIMIT` params coerced to integers (`intParams.ts`) — fixed `codebase_search` float rejection",
    "- Neo4j fulltext index ensured via `ensureNeo4jSetup`",
    "- Search fallback extended to match `qualifiedName` and `filePath` (local; deploy to prod)",
    "- E2E test queries adjusted: round 2 → `searchSymbolsInternal`, round 3 → `crons` (symbols present in synced graph)",
    "",
    "## Round results",
    "",
  ];

  for (const round of allRounds) {
    const roundResults = round.results;
    const roundPassed = roundResults.filter((r) => r.ok).length;
    lines.push(`### ${round.round}`);
    lines.push("");
    lines.push(`**${roundPassed}/${roundResults.length} passed**`);
    lines.push("");
    lines.push("| Tool | Status | Latency | Realistic prompt | Notes |");
    lines.push("| --- | --- | --- | --- | --- |");

    for (const r of roundResults) {
      const status = r.ok ? "PASS" : "FAIL";
      const latency = r.ms ? `${r.ms}ms` : "—";
      const prompt = (r.prompt ?? "").replace(/\|/g, "\\|");
      let notes = "";
      if (!r.ok) {
        notes = r.error ?? "error";
      } else if (r.data) {
        notes = summarize(r.data, 120).replace(/\|/g, "\\|");
      }
      lines.push(`| \`${r.tool}\` | ${status} | ${latency} | ${prompt} | ${notes} |`);
    }
    lines.push("");
  }

  lines.push("## Tool inventory (21 tools)");
  lines.push("");
  lines.push(
    "`ping`, `whoami`, `list_profiles`, `memory_search`, `memory_retrieve`, `memory_add`, `memory_update`, `memory_delete`, `skills_list`, `skills_get`, `wiki_list`, `wiki_get`, `wiki_search`, `wiki_create`, `wiki_update`, `codebases_list`, `codebase_overview`, `codebase_search`, `codebase_context`, `codebase_impact`, `codebase_graph`",
  );
  lines.push("");
  lines.push("## How to re-run");
  lines.push("");
  lines.push("```bash");
  lines.push("node scripts/test-vmem-mcp.mjs");
  lines.push("```");
  lines.push("");
  lines.push(
    "Requires OAuth token in `~/.mcp-auth/mcp-remote-0.1.37/` (same as Cursor mcp-remote).",
  );
  lines.push("");

  const mdPath = path.join(process.cwd(), "MCP-E2E-RESULTS.md");
  fs.writeFileSync(mdPath, lines.join("\n"));
  return mdPath;
}

async function main() {
  const accessToken = loadAccessToken();
  const headers = await createSession(accessToken);
  const allRounds = [];

  for (let i = 0; i < ROUNDS.length; i++) {
    allRounds.push({
      round: ROUNDS[i].name,
      results: await runRound(headers, ROUNDS[i], i),
    });
  }

  const outPath = path.join(process.cwd(), "MCP-E2E-RESULTS.json");
  fs.writeFileSync(outPath, JSON.stringify(allRounds, null, 2));
  console.log(`\nWrote ${outPath}`);

  const total = allRounds.flatMap((r) => r.results);
  const passed = total.filter((r) => r.ok).length;
  const mdPath = writeMarkdownReport(allRounds, {
    generatedAt: new Date().toISOString(),
    passed,
    total: total.length,
  });
  console.log(`Wrote ${mdPath}`);
  console.log(`\nTotal: ${passed}/${total.length} passed`);
  process.exit(passed === total.length ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
