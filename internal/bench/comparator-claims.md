# Comparator published claims (cited, NOT measured by us)

> Vendor-published figures for the report's "cited claims" section. **Not
> comparable** to vmem's measured LoCoMo J: different datasets, judges, and
> methodologies. Keep in a separate table from harness rows.

## OpenAI — ChatGPT "Dreaming" V3 (memory consolidation)

- Shipped 2 June 2026. Background consolidation of session transcripts.
- Reported **factual recall**: 41.5% (2024) → 67.9% (2025) → **82.8% (V3)**.
- **Preference adherence** 71.3%; **time-sensitive accuracy** 75.1%.
- **Caveat:** OpenAI-internal evaluation; methodology not fully published.
- Source: `openai.com/index/chatgpt-memory-dreaming/` (verify primary before quoting).

## Perplexity — "Brain" (agent memory)

- Reported **relative** gains: **+25% accuracy**, **+16% recall**, **−13% cost**.
- **Caveat:** relative to Perplexity's own no-memory baseline; not LoCoMo J.
- Source: `perplexity.ai/hub/blog/self-improving-memory-for-agents`

## Mem0 / Supermemory / others (LoCoMo or LongMemEval)

See appendix template in `packages/backend/neo4j-cli/bench/report.ts`
(`PUBLISHED_NUMBERS`). Re-run mem0/supermemory under **our** harness before
citing as comparable.

## How to use in a public post

| System           | Reported figure          | Benchmark | Verified by us? |
| ---------------- | ------------------------ | --------- | --------------- |
| vmem             | _from locomo-results.md_ | LoCoMo J  | Yes (harness)   |
| OpenAI Dreaming  | 82.8% recall             | Internal  | No              |
| Perplexity Brain | +25% accuracy            | Internal  | No              |

Honest framing: vmem publishes a **reproducible** number; vendor rows are context only.
