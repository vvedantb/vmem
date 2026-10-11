// Adapted from unblocked/context-engine-simulator (MIT, Copyright 2026 Unblocked)
// https://github.com/unblocked/context-engine-simulator
// The stream-json spawn and abort-on-contamination loop follow its runner.

import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createContaminationGuard } from "./guard.ts";
import { JUDGE_JSON_SCHEMA, parseJudgeOutput } from "./judge.ts";
import { parseStreamLine, splitNdjson, type StreamResult } from "./stream.ts";
import type { Arm, JudgeResult } from "./types.ts";

export const DEFAULT_VMEM_MCP_URL =
  "https://clear-bear-690.eu-west-1.convex.site/mcp";

type McpServers = Record<string, { type: "http"; url: string }>;

export interface SpawnRequest {
  args: string[];
  stdin: string;
  timeoutMs: number;
  cwd: string;
  // Called per complete stdout line. Return true to kill the process.
  onLine?: (line: string) => boolean;
}

export interface SpawnResponse {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  aborted: boolean;
}

export type SpawnClaude = (request: SpawnRequest) => Promise<SpawnResponse>;

export interface AgentRun {
  text: string;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
}

export function claudeOnPath(): boolean {
  return spawnSync("claude", ["--version"], { stdio: "ignore" }).status === 0;
}

export const spawnClaude: SpawnClaude = (request) =>
  new Promise((resolve, reject) => {
    const child = spawn("claude", request.args, {
      cwd: request.cwd,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let pending = "";
    let timedOut = false;
    let aborted = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, request.timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
      const { lines, rest } = splitNdjson(pending + chunk);
      pending = rest;
      if (aborted) return;
      for (const line of lines) {
        if (request.onLine?.(line) === true) {
          aborted = true;
          child.kill("SIGTERM");
          return;
        }
      }
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode, timedOut, aborted });
    });
    child.stdin.on("error", () => undefined);
    child.stdin.end(request.stdin);
  });

// Each run gets an empty cwd and its own MCP config so nothing leaks in.
async function withSandbox<T>(
  mcpServers: McpServers,
  run: (dir: string, mcpConfigPath: string) => Promise<T>,
): Promise<T> {
  const dir = mkdtempSync(path.join(tmpdir(), "vmem-e2e-ab-"));
  try {
    const configPath = path.join(dir, "mcp.json");
    writeFileSync(configPath, JSON.stringify({ mcpServers }));
    return await run(dir, configPath);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export interface RunAgentOptions {
  arm: Arm;
  prompt: string;
  model?: string;
  vmemMcpUrl: string;
  timeoutMs: number;
  spawn: SpawnClaude;
}

// Throws ContaminationError when a banned MCP server is invoked, and Error on
// timeout or non-zero exit.
export async function runAgent(options: RunAgentOptions): Promise<AgentRun> {
  const mcpServers: McpServers =
    options.arm === "on"
      ? { vmem: { type: "http", url: options.vmemMcpUrl } }
      : {};
  return withSandbox(mcpServers, async (cwd, configPath) => {
    // Off arm: no tools, empty MCP. On arm: do not pass `--tools ""` — that
    // would strip MCP. `--strict-mcp-config` already limits servers to vmem.
    const args = [
      "-p",
      "--output-format",
      "stream-json",
      "--verbose",
      "--strict-mcp-config",
      "--mcp-config",
      configPath,
      ...(options.arm === "off" ? ["--tools", ""] : []),
      ...(options.model ? ["--model", options.model] : []),
    ];
    const guard = createContaminationGuard(options.arm);
    const response = await options.spawn({
      args,
      stdin: options.prompt,
      timeoutMs: options.timeoutMs,
      cwd,
      onLine: (line) => {
        const parsed = parseStreamLine(line);
        return parsed !== null && guard(parsed.mcpServers) !== null;
      },
    });

    // Authoritative pass over the full output, so a spawn that skips onLine
    // is still checked.
    let result: StreamResult | null = null;
    for (const line of splitNdjson(`${response.stdout}\n`).lines) {
      const parsed = parseStreamLine(line);
      if (parsed === null) continue;
      const violation = guard(parsed.mcpServers);
      if (violation !== null) throw violation;
      if (parsed.result !== null) result = parsed.result;
    }

    if (response.timedOut) {
      throw new Error(`claude timed out after ${options.timeoutMs} ms`);
    }
    if (response.exitCode !== 0 && result === null) {
      throw new Error(
        `claude exited with code ${response.exitCode}: ${response.stderr.trim().slice(0, 300)}`,
      );
    }
    if (result?.isError === true) {
      throw new Error(`claude reported an error: ${result.text.slice(0, 300)}`);
    }
    return {
      text: result?.text ?? "",
      costUsd: result?.costUsd ?? 0,
      inputTokens: result?.inputTokens ?? 0,
      outputTokens: result?.outputTokens ?? 0,
      durationMs: result?.durationMs ?? 0,
    };
  });
}

export interface RunJudgeOptions {
  prompt: string;
  model: string;
  timeoutMs: number;
  spawn: SpawnClaude;
}

// No tools and an empty strict MCP config. Null when the output fails the schema.
export async function runJudge(
  options: RunJudgeOptions,
): Promise<JudgeResult | null> {
  return withSandbox({}, async (cwd, configPath) => {
    const response = await options.spawn({
      args: [
        "-p",
        "--output-format",
        "json",
        "--json-schema",
        JSON.stringify(JUDGE_JSON_SCHEMA),
        "--tools",
        "",
        "--strict-mcp-config",
        "--mcp-config",
        configPath,
        "--model",
        options.model,
      ],
      stdin: options.prompt,
      timeoutMs: options.timeoutMs,
      cwd,
    });
    if (response.timedOut) {
      throw new Error(`judge timed out after ${options.timeoutMs} ms`);
    }
    return parseJudgeOutput(response.stdout);
  });
}
