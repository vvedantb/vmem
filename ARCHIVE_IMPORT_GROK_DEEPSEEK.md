# Archived conversation imports (Grok, DeepSeek, Gemini, Perplexity)

Restores non–ChatGPT/Claude import providers on top of current `staging`.

- **Grok / DeepSeek:** full parsers + logos (from `85ea5ba0`)
- **Gemini / Perplexity:** coming-soon stubs + logos only (never had parsers)
- **Kept on staging:** ChatGPT + Claude import
- **Safe to merge** if you want these providers back in the import UI

## Restore

Merge this PR, or:

```bash
git checkout archive/import-grok-deepseek
```
