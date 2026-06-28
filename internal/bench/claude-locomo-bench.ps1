# Claude Code LoCoMo effectiveness bench
#
# Answers LoCoMo questions via `claude -p` with MCP ON vs OFF, then judges with
# Claude (not OpenRouter). Ingest still uses the production vmem pipeline once
# (OpenRouter in bench:locomo) so memories exist in YOUR account for MCP retrieval.
#
# Prerequisites:
#   - `claude` CLI authenticated (Anthropic subscription / API)
#   - vmem MCP OAuth working (same as Cursor — ~/.mcp-auth)
#   - packages/backend/.env.local with NEO4J_* + OPENROUTER_API_KEY (ingest only)
#   - $env:VMEM_BENCH_CLERK_ID = your Clerk user id (memories must be MCP-visible)
#
# Usage:
#   pwsh -File internal/bench/claude-locomo-bench.ps1 -Conversations 1 -MaxQuestions 5 -MaxSessions 3
#   pwsh -File internal/bench/claude-locomo-bench.ps1 -SkipIngest   # memories already ingested

param(
    [int]$Conversations = 1,
    [int]$MaxQuestions = 5,
    [int]$MaxSessions = 3,
    [string]$RunId = "claude-$(Get-Date -Format 'yyyy-MM-dd-HHmm')",
    [switch]$SkipIngest
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $Root

$ClerkId = $env:VMEM_BENCH_CLERK_ID
if (-not $SkipIngest -and [string]::IsNullOrWhiteSpace($ClerkId)) {
    throw "Set VMEM_BENCH_CLERK_ID to your Clerk user id so ingested LoCoMo memories are visible to the vmem MCP connector."
}

$OutDir = Join-Path $PSScriptRoot "claude-locomo-runs"
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$McpConfig = Join-Path $PSScriptRoot "claude-mcp-vmem-only.json"
$CommonClaude = @(
    "--output-format", "json",
    "--no-session-persistence",
    "--dangerously-skip-permissions"
)

function Invoke-ClaudeJson {
    param([string[]]$ExtraArgs, [string]$Prompt)
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        $lines = @("") | & claude -p $Prompt @CommonClaude @ExtraArgs 2>&1
    }
    finally {
        $ErrorActionPreference = $prevEap
    }
    $lines = @($lines) | Where-Object { $_ -is [string] -or $_ -is [System.Management.Automation.ErrorRecord] } | ForEach-Object {
        if ($_ -is [System.Management.Automation.ErrorRecord]) { [string]$_.Exception.Message } else { $_ }
    }
    $jsonLine = $lines | Where-Object { $_ -match '^\{"type":"result"' } | Select-Object -Last 1
    if (-not $jsonLine) {
        $jsonLine = $lines | Where-Object { $_ -match '^\{' } | Select-Object -Last 1
    }
    if ([string]::IsNullOrWhiteSpace($jsonLine)) {
        throw "claude returned no JSON result line. Last lines: $($lines | Select-Object -Last 3 | Out-String)"
    }
    return $jsonLine | ConvertFrom-Json
}

function Get-AnswerText {
    param($Result)
    if ($null -eq $Result) { return "" }
    if ($Result.is_error) { return "" }
    $text = [string]$Result.result
    return $text.Trim()
}

function Invoke-Judge {
    param(
        [string]$Question,
        [string]$Gold,
        [string]$Generated
    )
    $prompt = @"
You are grading a memory QA benchmark. Compare the generated answer to the gold answer for the same question.

Question: $Question
Gold answer: $Gold
Generated answer: $Generated

Reply with JSON only (no markdown): { "correct": true or false, "reason": "one sentence" }
Mark correct if the generated answer contains the same factual content as gold, allowing paraphrase.
"@
    $r = Invoke-ClaudeJson -ExtraArgs @() -Prompt $prompt
    $raw = Get-AnswerText $r
    try {
        $parsed = $raw | ConvertFrom-Json
        return [PSCustomObject]@{
            correct = [bool]$parsed.correct
            reason  = [string]$parsed.reason
            judge_cost_usd = [decimal]$r.total_cost_usd
        }
    }
    catch {
        return [PSCustomObject]@{
            correct = $false
            reason  = "judge parse failed"
            judge_cost_usd = [decimal]$r.total_cost_usd
        }
    }
}

if (-not $SkipIngest) {
    Write-Host "[profile] Resolving MCP active profile for $ClerkId..."
    Push-Location (Join-Path $Root "packages/backend")
    $profileId = & pnpm exec tsx neo4j-cli/bench/resolveMcpProfile.ts $ClerkId 2>&1
    if ($LASTEXITCODE -ne 0) { Pop-Location; throw "could not resolve MCP profile: $profileId" }
    $profileId = ($profileId | Out-String).Trim()
    if ([string]::IsNullOrWhiteSpace($profileId)) {
        Pop-Location
        throw "resolveMcpProfile.ts returned empty profile id"
    }
    Write-Host "[profile] Using profile $profileId"

    Write-Host "[ingest] Loading LoCoMo into vmem under clerk $ClerkId ($MaxSessions sessions per conv)..."
    $ingestArgs = @(
        "bench:locomo",
        "--run-id", "ingest-$RunId",
        "--providers", "vmem",
        "--conversations", "$Conversations",
        "--max-sessions", "$MaxSessions",
        "--max-questions", "0",
        "--user", $ClerkId,
        "--profile", $profileId,
        "--fast-ingest"
    )
    & pnpm @ingestArgs
    if ($LASTEXITCODE -ne 0) { throw "ingest failed with exit $LASTEXITCODE" }
    Pop-Location
}

Write-Host "[export] Loading questions..."
Push-Location (Join-Path $Root "packages/backend")
$questionsRaw = & pnpm exec tsx neo4j-cli/bench/exportQuestions.ts -- --conversations $Conversations --max-questions $MaxQuestions 2>&1
Pop-Location
$rawText = ($questionsRaw | Out-String).Trim()
$start = $rawText.IndexOf('[')
$end = $rawText.LastIndexOf(']')
if ($start -lt 0 -or $end -le $start) {
    throw "exportQuestions.ts did not print a JSON array (pnpm noise or missing dataset; run pnpm bench:download)"
}
$questionsJson = $rawText.Substring($start, $end - $start + 1)
$questions = $questionsJson | ConvertFrom-Json

$rows = @()
foreach ($q in $questions) {
    $slug = "$($q.conversationId)-q$($q.qaIndex)"
    Write-Host "[qa] $slug - $($q.question.Substring(0, [Math]::Min(60, $q.question.Length)))..."

    $baseRules = "Reply with ONLY the short factual answer. No preamble, no markdown headers."

    # Without vmem: no MCP, no repo, no CLAUDE.md injection
    $noMemPrompt = @"
$baseRules

Question: $($q.question)

You have no access to stored memories, MCP, or prior conversations. Reason from the question and general knowledge; give your best short factual answer. Do not use tools. Only say you cannot determine the answer if it truly requires private conversation history you do not have.
"@
    $noMem = Invoke-ClaudeJson -ExtraArgs @(
        "--disallowed-tools", "mcp__*"
    ) -Prompt $noMemPrompt
    $noMemAns = Get-AnswerText $noMem
    $noMemJudge = Invoke-Judge -Question $q.question -Gold $q.gold -Generated $noMemAns

    # With vmem: MCP only (production connector)
    $vmemPrompt = @"
$baseRules

Question: $($q.question)

Use the vmem MCP connector only: call memory_retrieve and/or memory_search (and context_prompt_get if helpful) to find memories about this conversation, then answer from those memories.
Do not use Read, Grep, Glob, or Bash on source files.
"@
    $vmem = Invoke-ClaudeJson -ExtraArgs @(
        "--strict-mcp-config",
        "--mcp-config", $McpConfig,
        "--disallowed-tools", "Read,Grep,Glob,Bash,WebFetch,WebSearch"
    ) -Prompt $vmemPrompt
    $vmemAns = Get-AnswerText $vmem
    $vmemJudge = Invoke-Judge -Question $q.question -Gold $q.gold -Generated $vmemAns

    $rows += [PSCustomObject]@{
        run_id           = $RunId
        conversation_id  = $q.conversationId
        qa_index         = $q.qaIndex
        category         = $q.category
        category_label   = $q.categoryLabel
        question         = $q.question
        gold             = $q.gold
        no_memory_answer = $noMemAns
        no_memory_correct = $noMemJudge.correct
        vmem_answer      = $vmemAns
        vmem_correct     = $vmemJudge.correct
        no_memory_turns  = $noMem.num_turns
        vmem_turns       = $vmem.num_turns
        no_memory_cost   = [decimal]$noMem.total_cost_usd
        vmem_cost        = [decimal]$vmem.total_cost_usd
        judge_cost       = [decimal]($noMemJudge.judge_cost_usd + $vmemJudge.judge_cost_usd)
    }

    $noMemPath = Join-Path $OutDir "$slug-no-memory.json"
    $vmemPath = Join-Path $OutDir "$slug-vmem.json"
    [System.IO.File]::WriteAllText($noMemPath, ($noMem | ConvertTo-Json -Depth 8))
    [System.IO.File]::WriteAllText($vmemPath, ($vmem | ConvertTo-Json -Depth 8))
}

$csvPath = Join-Path $PSScriptRoot "claude-locomo-runs.csv"
$rows | Export-Csv -Path $csvPath -NoTypeInformation

$noCorrect = ($rows | Where-Object no_memory_correct).Count
$vmemCorrect = ($rows | Where-Object vmem_correct).Count
$n = $rows.Count
$noJ = if ($n -gt 0) { [math]::Round(100 * $noCorrect / $n, 1) } else { 0 }
$vmemJ = if ($n -gt 0) { [math]::Round(100 * $vmemCorrect / $n, 1) } else { 0 }

$liftPp = [math]::Round($vmemJ - $noJ, 1)
$avgNoCost = [math]::Round(($rows | Measure-Object no_memory_cost -Average).Average, 4)
$avgVmemCost = [math]::Round(($rows | Measure-Object vmem_cost -Average).Average, 4)
$avgNoTurns = [math]::Round(($rows | Measure-Object no_memory_turns -Average).Average, 2)
$avgVmemTurns = [math]::Round(($rows | Measure-Object vmem_turns -Average).Average, 2)
$generatedAt = Get-Date -Format "yyyy-MM-dd HH:mm"

$md = @"
# Claude Code LoCoMo effectiveness (MCP on vs off)

**Run id:** $RunId  
**Generated:** $generatedAt  
**Questions:** $n (LoCoMo, adversarial excluded)  
**Answer + judge:** Claude Code CLI (claude -p), not OpenRouter

## Headline (LLM-judge accuracy J)

| Condition | J | Correct |
|---|---:|---:|
| **no-memory** (MCP off, bare) | **${noJ}%** | $noCorrect / $n |
| **vmem** (MCP on, memory tools only) | **${vmemJ}%** | $vmemCorrect / $n |

**Lift (vmem vs no-memory):** $liftPp pp

## Per category

| Category | no-memory | vmem |
|---|---:|---:|
"@

$cats = $rows | Group-Object category_label | Sort-Object Name
foreach ($g in $cats) {
    $sub = $g.Group
    $nn = $sub.Count
    $nc = ($sub | Where-Object no_memory_correct).Count
    $vc = ($sub | Where-Object vmem_correct).Count
    $md += "`n| $($g.Name) | $([math]::Round(100*$nc/$nn,1))% ($nc/$nn) | $([math]::Round(100*$vc/$nn,1))% ($vc/$nn) |"
}

$md += @"

## Methodology

- **Ingest:** production vmem bench pipeline (bench:locomo --max-questions 0) into account $ClerkId so MCP retrieval sees the LoCoMo sessions.
- **no-memory:** claude -p with MCP tools disabled - no connector, no repo tools.
- **vmem:** claude -p --strict-mcp-config with vmem HTTP MCP only; repo tools blocked.
- **Judge:** separate claude -p JSON verdict per answer (same family as answer model).

## Costs (USD, Claude billing)

| | no-memory | vmem |
|---|---:|---:|
| Avg answer cost | $avgNoCost | $avgVmemCost |
| Avg turns | $avgNoTurns | $avgVmemTurns |

Raw: claude-locomo-runs.csv, claude-locomo-runs/*.json
"@

$mdPath = Join-Path $PSScriptRoot "claude-locomo-results.md"

[System.IO.File]::WriteAllText($mdPath, $md)
Write-Host "Done. J: no-memory=$noJ% vmem=$vmemJ% -> $mdPath"
