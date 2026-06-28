# Fair Claude Code token benchmark: explore (Read/Grep) vs vmem (MCP only).
# Usage: pwsh -File internal/bench/claude-token-bench.ps1 [-RunsPerCell 3]
param(
    [int]$RunsPerCell = 3
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $Root

$OutDir = Join-Path $PSScriptRoot "claude-runs"
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$Questions = @(
    "How does retrieveMemories fuse vector, graph, and keyword results? Describe the ranking approach.",
    "What conditions trigger automatic dream mode, including quiet period and pile-up thresholds?",
    "How does the chrome extension service worker obtain a Convex JWT without running clerk-js?",
    "Why does Neo4j need neo4j.int() on LIMIT and hop parameters, and where is that handled?",
    "How does workspace routing scope web app routes to profileId?"
)

$CommonFlags = @(
    "--output-format", "json",
    "--no-session-persistence",
    "--dangerously-skip-permissions"
)

function Invoke-ClaudeBench {
    param(
        [string]$Condition,
        [int]$QuestionIndex,
        [int]$RunIndex,
        [string]$Question
    )

    $slug = "q$QuestionIndex-run$RunIndex"
    $outFile = Join-Path $OutDir "$Condition-$slug.json"

    if ($Condition -eq "injected") {
        $prompt = "$Question Keep the answer concise (under 300 words)."
        $extra = @()
    }
    elseif ($Condition -eq "explore") {
        $prompt = @"
$Question

Rules: Answer only by exploring this repository with Read, Grep, and Glob.
Do not use any MCP tools. Keep the answer concise (under 300 words).
"@
        $extra = @("--disallowed-tools", "mcp__*")
    }
    elseif ($Condition -eq "vmem") {
        $prompt = @"
$Question

Rules: Answer using only the vmem MCP connector (memory_search, memory_retrieve, codebase_search, codebase_context, context prompt resource).
Do not use Read, Grep, or Glob on source files. Keep the answer concise (under 300 words).
"@
        $extra = @("--disallowed-tools", "Read,Grep,Glob")
    }
    else {
        throw "Unknown condition: $Condition"
    }

    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] $Condition $slug ..."
    $lines = & claude -p $prompt @CommonFlags @extra 2>&1
    $jsonLine = $lines | Where-Object { $_ -match '^\{"type":"result"' } | Select-Object -Last 1
    if (-not $jsonLine) {
        $jsonLine = $lines | Select-Object -Last 1
    }
    [System.IO.File]::WriteAllText($outFile, $jsonLine)

    $r = $jsonLine | ConvertFrom-Json
    $u = $r.usage
  $total = $u.input_tokens + $u.output_tokens + $u.cache_read_input_tokens + $u.cache_creation_input_tokens
    [PSCustomObject]@{
        condition      = $Condition
        question_index = $QuestionIndex
        run_index      = $RunIndex
        question       = $Question
        file           = $outFile
        turns          = $r.num_turns
        duration_ms    = $r.duration_ms
        cost_usd       = [decimal]$r.total_cost_usd
        input_tokens   = $u.input_tokens
        output_tokens  = $u.output_tokens
        cache_read     = $u.cache_read_input_tokens
        cache_create   = $u.cache_creation_input_tokens
        token_sum      = $total
        error          = if ($r.is_error) { $r.result } else { $null }
    }
}

$rows = @()
foreach ($cond in @("injected", "explore", "vmem")) {
    for ($qi = 0; $qi -lt $Questions.Count; $qi++) {
        for ($ri = 1; $ri -le $RunsPerCell; $ri++) {
            $rows += Invoke-ClaudeBench -Condition $cond -QuestionIndex $qi -RunIndex $ri -Question $Questions[$qi]
        }
    }
}

$csvPath = Join-Path $PSScriptRoot "claude-token-runs.csv"
$rows | Export-Csv -Path $csvPath -NoTypeInformation

function Get-Agg($subset) {
    $n = @($subset).Count
    if ($n -eq 0) { return $null }
    [PSCustomObject]@{
        n          = $n
        turns_avg  = [math]::Round(($subset | Measure-Object -Property turns -Average).Average, 2)
        cost_avg   = [math]::Round(($subset | Measure-Object -Property cost_usd -Average).Average, 4)
        token_avg  = [math]::Round(($subset | Measure-Object -Property token_sum -Average).Average, 0)
        token_med  = ($subset | Sort-Object token_sum)[[math]::Floor(($n - 1) / 2)].token_sum
    }
}

$mdPath = Join-Path $PSScriptRoot "claude-token-results.md"
$injectedAgg = Get-Agg ($rows | Where-Object condition -eq "injected")
$exploreAgg = Get-Agg ($rows | Where-Object condition -eq "explore")
$vmemAgg = Get-Agg ($rows | Where-Object condition -eq "vmem")

$md = @"
# Claude Code token benchmark (explore vs vmem)

**Generated:** $(Get-Date -Format "yyyy-MM-dd HH:mm")  
**Runs per cell:** $RunsPerCell × $($Questions.Count) questions × 3 conditions = $($rows.Count) total

## Why the naive benchmark fails

| Naive baseline | vmem prompt |
|---|---|
| Answers from injected CLAUDE.md + auto-memory in **1 turn** | Triggers **multi-turn MCP** (codebase sync, search, graph) |
| No file reads, no retrieval | Pays connector round-trip tax |
| Looks token-cheap | Looks token-expensive |

That compares **free injected context** vs **active retrieval** — not a fair efficiency test.

## Fair comparison (this harness)

| Condition | Allowed | Blocked |
|---|---|---|
| **explore** | Read, Grep, Glob | All MCP |
| **vmem** | vmem MCP (memory + codebase tools) | Read, Grep, Glob |

Same factual questions; concise answer cap in prompt.

## Aggregate

| Condition | n | Avg turns | Avg cost (USD) | Avg token sum | Median token sum |
|---|---:|---:|---:|---:|---:|
| injected (unfair) | $($injectedAgg.n) | $($injectedAgg.turns_avg) | $($injectedAgg.cost_avg) | $($injectedAgg.token_avg) | $($injectedAgg.token_med) |
| explore | $($exploreAgg.n) | $($exploreAgg.turns_avg) | $($exploreAgg.cost_avg) | $($exploreAgg.token_avg) | $($exploreAgg.token_med) |
| vmem | $($vmemAgg.n) | $($vmemAgg.turns_avg) | $($vmemAgg.cost_avg) | $($vmemAgg.token_avg) | $($vmemAgg.token_med) |

**Token ratio (explore/vmem):** $([math]::Round($exploreAgg.token_avg / [math]::Max($vmemAgg.token_avg, 1), 2))× (>1 = vmem cheaper on average)

> For the slide deck, prefer **LoCoMo** (``locomo-results.md``): vmem retrieval averages **263 tokens/question** vs full-context **19,168** (73× reduction at 72% of ceiling accuracy). Claude Code CLI is a poor proxy because it injects CLAUDE.md for free.

## Per-question averages

| Q | injected | explore | vmem |
|---:|---:|---:|---:|
"@

for ($qi = 0; $qi -lt $Questions.Count; $qi++) {
    $i = Get-Agg ($rows | Where-Object { $_.condition -eq "injected" -and $_.question_index -eq $qi })
    $e = Get-Agg ($rows | Where-Object { $_.condition -eq "explore" -and $_.question_index -eq $qi })
    $v = Get-Agg ($rows | Where-Object { $_.condition -eq "vmem" -and $_.question_index -eq $qi })
    $md += "| $qi | $($i.token_avg) | $($e.token_avg) | $($v.token_avg) |`n"
}

$md += @"

## Questions

"@
for ($qi = 0; $qi -lt $Questions.Count; $qi++) {
    $md += "$qi. $($Questions[$qi])`n"
}

$md += @"

## Raw rows

See ``claude-token-runs.csv`` and ``claude-runs/*.json``.
"@

[System.IO.File]::WriteAllText($mdPath, $md)
Write-Host "Done. Wrote $csvPath and $mdPath"
