# Full LoCoMo via the production bench harness, with Claude CLI for answer + judge.
#
# Default: delegates to `pnpm bench:locomo:claude` (all conversations/questions,
# production retrieveMemories + shared judgePrompt.ts). Use -McpMode for the
# legacy three-arm Claude MCP smoke test (20 questions, MCP retrieval).
#
# Prerequisites:
#   - `claude` CLI authenticated
#   - packages/backend/.env.local with NEO4J_* + OPENROUTER_API_KEY (vmem ingest)
#   - $env:VMEM_BENCH_CLERK_ID when using vmem under your account (optional)

param(
    [int]$Conversations = 0,
    [int]$MaxQuestions = 0,
    [int]$MaxSessions = 0,
    [string]$RunId = "claude-$(Get-Date -Format 'yyyy-MM-dd-HHmm')",
    [string]$Providers = "no-memory,vmem,full-context",
    [switch]$Resume,
    [switch]$DryRun,
    [switch]$FastIngest,
    [switch]$McpMode
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $Root

if ($McpMode) {
    $mcpConv = if ($Conversations -gt 0) { $Conversations } else { 1 }
    $mcpQ = if ($MaxQuestions -gt 0) { $MaxQuestions } else { 5 }
    $mcpS = if ($MaxSessions -gt 0) { $MaxSessions } else { 3 }
    & (Join-Path $PSScriptRoot "claude-locomo-mcp-bench.ps1") `
        -Conversations $mcpConv -MaxQuestions $mcpQ -MaxSessions $mcpS -RunId $RunId
    exit $LASTEXITCODE
}

$benchArgs = @(
    "--filter", "@vmem/backend",
    "bench:locomo:claude",
    "--",
    "--run-id", $RunId,
    "--providers", $Providers
)

if ($Conversations -gt 0) {
    $benchArgs += @("--conversations", "$Conversations")
}
if ($MaxQuestions -gt 0) {
    $benchArgs += @("--max-questions", "$MaxQuestions")
}
if ($MaxSessions -gt 0) {
    $benchArgs += @("--max-sessions", "$MaxSessions")
}
if ($Resume) { $benchArgs += "--resume" }
if ($DryRun) { $benchArgs += "--dry-run" }
if ($FastIngest) { $benchArgs += "--fast-ingest" }

$ClerkId = $env:VMEM_BENCH_CLERK_ID
if (-not [string]::IsNullOrWhiteSpace($ClerkId)) {
    $benchArgs += @("--user", $ClerkId)
}

Write-Host "[bench] pnpm $($benchArgs -join ' ')"
& pnpm @benchArgs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

if (-not $DryRun) {
    Write-Host "[report] generating locomo-results.md..."
    Push-Location (Join-Path $Root "packages/backend")
    & pnpm bench:report -- --run-id $RunId
    Pop-Location
    Write-Host "Done. See packages/backend/neo4j-cli/bench/results/$RunId.jsonl and internal/bench/locomo-results.md"
}
