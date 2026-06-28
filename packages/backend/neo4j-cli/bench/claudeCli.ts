/**
 * Claude Code CLI backend for the LoCoMo bench harness.
 *
 * Pipes prompts on stdin (Windows cmdline caps ~8k chars). Parses the final
 * `{"type":"result",...}` JSON line from stdout — same contract as
 * internal/bench/claude-locomo-bench.ps1.
 */

import { spawn } from "node:child_process";
import type { BenchLlm, BenchLlmTotals } from "./llm";
import type { CallBudget } from "./llm";

const JSON_SYSTEM_INSTRUCTION =
  "Respond with ONLY valid JSON. No thinking, no markdown, no commentary.";

interface ClaudeResultLine {
  type: string;
  result?: string;
  is_error?: boolean;
  total_cost_usd?: number;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
}

function parseClaudeStdout(stdout: string): ClaudeResultLine | null {
  const lines = stdout.split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]?.trim() ?? "";
    if (line.startsWith('{"type":"result"')) {
      try {
        return JSON.parse(line) as ClaudeResultLine;
      } catch {
        continue;
      }
    }
  }
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]?.trim() ?? "";
    if (line.startsWith("{")) {
      try {
        return JSON.parse(line) as ClaudeResultLine;
      } catch {
        continue;
      }
    }
  }
  return null;
}

function runClaude(
  fullPrompt: string,
  extraArgs: string[],
): Promise<ClaudeResultLine | null> {
  return new Promise((resolve) => {
    const args = [
      "-p",
      "--output-format",
      "json",
      "--no-session-persistence",
      "--dangerously-skip-permissions",
      ...extraArgs,
    ];
    const proc = spawn("claude", args, {
      stdio: ["pipe", "pipe", "pipe"],
      shell: process.platform === "win32",
    });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    proc.on("error", (err) => {
      console.warn(`[bench-claude] spawn failed: ${err.message}`);
      resolve(null);
    });
    proc.on("close", (code) => {
      if (code !== 0) {
        console.warn(
          `[bench-claude] exit ${String(code)}: ${stderr.slice(0, 300)}`,
        );
      }
      resolve(parseClaudeStdout(stdout));
    });
    proc.stdin.write(fullPrompt);
    proc.stdin.end();
  });
}

export interface BenchClaudeLlmConfig {
  budget?: CallBudget;
  /** Claude CLI model alias or full name (default sonnet — higher subscription limits). */
  model?: string;
  extraArgs?: string[];
}

const DEFAULT_CLAUDE_MODEL = "sonnet";

export function createBenchClaudeLlm(config: BenchClaudeLlmConfig): BenchLlm {
  const totals: BenchLlmTotals = {
    calls: 0,
    promptTokens: 0,
    completionTokens: 0,
    costUsd: 0,
  };
  const model = config.model ?? DEFAULT_CLAUDE_MODEL;
  const extraArgs = config.extraArgs ?? [];
  const cliArgs = ["--model", model, ...extraArgs];

  async function send(system: string, prompt: string): Promise<string | null> {
    if (config.budget) config.budget.record();
    totals.calls += 1;

    const fullPrompt =
      system.trim().length > 0 ? `${system}\n\n${prompt}` : prompt;
    const result = await runClaude(fullPrompt, cliArgs);
    if (!result || result.is_error) {
      console.warn("[bench-claude] call failed or error result");
      return null;
    }

    const usage = result.usage;
    if (usage) {
      totals.promptTokens += usage.input_tokens ?? 0;
      totals.completionTokens += usage.output_tokens ?? 0;
    }
    if (typeof result.total_cost_usd === "number") {
      totals.costUsd += result.total_cost_usd;
    }

    const text = result.result;
    return typeof text === "string" ? text : null;
  }

  return {
    totals,
    chatJson(prompt, role) {
      const system = role
        ? `${role} ${JSON_SYSTEM_INSTRUCTION}`
        : JSON_SYSTEM_INSTRUCTION;
      return send(system, prompt);
    },
    chatText(prompt, role) {
      return send(role ?? "You are a helpful assistant.", prompt);
    },
  };
}
