# Add Gemini, Grok, DeepSeek, Perplexity to Import page

## Context

Current `/settings/import` only has ChatGPT + Claude. User wants Gemini, Grok, DeepSeek, Perplexity added. Current code uses ternaries keyed off `provider === "chatgpt" ? ... : ...` which breaks past 2 providers. Mixed approach: parsers for providers with known JSON exports (Grok, DeepSeek); Coming Soon cards for the rest (Gemini — messy Takeout HTML, Perplexity — no export exists). Refactor to config-driven so future providers drop in.

## Approach

Single `importProviders` config array drives cards, upload modal, parser dispatch, and memory source/tag. Discriminated union separates `available` (has parser + instructions) from `coming-soon` (logo + copy only). No ternaries, no new conditionals per provider.

## Files

### New

- `apps/web/src/components/settings/importProviders.tsx` — config array (TSX so Logo components co-locate cleanly)
- `apps/web/src/components/settings/GeminiLogo.tsx`
- `apps/web/src/components/settings/GrokLogo.tsx`
- `apps/web/src/components/settings/DeepSeekLogo.tsx`
- `apps/web/src/components/settings/PerplexityLogo.tsx`
- `apps/web/src/components/_utils/parseGrokExport.ts`
- `apps/web/src/components/_utils/parseDeepSeekExport.ts`

### Modified

- `apps/web/src/components/settings/ImportPageClient.tsx` — map over config, lookup parser/source/tag via `providerId`
- `apps/web/src/components/settings/UploadImportModal.tsx` — take `provider: AvailableProvider` object instead of `ImportProvider` string; drop internal `instructions` record

## Config shape (discriminated union — no optionals-as-flags)

```ts
// importProviders.tsx
import type { ComponentType } from "react";
import type { ExportImportRow } from "../_utils/importRows";

export type ParseResult =
  | { ok: true; rows: ExportImportRow[] }
  | { ok: false; error: string };

type LogoProps = { className?: string };

type BaseProvider = {
  id: string;
  label: string;
  description: string;
  Logo: ComponentType<LogoProps>;
  logoClassName: string;
};

export type AvailableProvider = BaseProvider & {
  kind: "available";
  parser: (buffer: ArrayBuffer) => ParseResult;
  instructions: { title: string; steps: string[]; accept: string };
  source: string; // e.g. "import:grok"
  tag: string;    // e.g. "grok"
};

export type ComingSoonProvider = BaseProvider & {
  kind: "coming-soon";
};

export type ImportProvider = AvailableProvider | ComingSoonProvider;

export const importProviders: readonly ImportProvider[] = [
  { kind: "available", id: "chatgpt", label: "ChatGPT", Logo: OpenAiLogo, logoClassName: "text-[#10A37F] dark:text-[#1EC286]", parser: parseChatGptExportBuffer, source: "import:chatgpt", tag: "chatgpt", description: "...", instructions: { ... } },
  { kind: "available", id: "claude", label: "Claude", Logo: ClaudeLogo, ... },
  { kind: "available", id: "grok", label: "Grok", Logo: GrokLogo, logoClassName: "text-foreground", parser: parseGrokExportBuffer, source: "import:grok", tag: "grok", ... },
  { kind: "available", id: "deepseek", label: "DeepSeek", Logo: DeepSeekLogo, logoClassName: "text-[#4D6BFE]", parser: parseDeepSeekExportBuffer, source: "import:deepseek", tag: "deepseek", ... },
  { kind: "coming-soon", id: "gemini", label: "Gemini", Logo: GeminiLogo, logoClassName: "text-[#4285F4]", description: "Google Takeout export — support coming soon." },
  { kind: "coming-soon", id: "perplexity", label: "Perplexity", Logo: PerplexityLogo, logoClassName: "text-[#20808D]", description: "Perplexity does not yet offer bulk export. Coming soon." },
];
```

No `any`/`unknown`/`as`. Discriminated union → exhaustive narrowing in consumers.

## ImportPageClient refactor

Replace ternaries with lookup:

```ts
const handleFile = useCallback(
  async (file: File) => {
    const p = importProviders.find(
      (x): x is AvailableProvider =>
        x.kind === "available" && x.id === providerId,
    );
    if (!p) return;
    const buf = await file.arrayBuffer();
    const result = p.parser(buf);
    // ...
  },
  [providerId],
);

const handleImport = async (selected: ExportImportRow[]) => {
  const p = importProviders.find(
    (x): x is AvailableProvider =>
      x.kind === "available" && x.id === providerId,
  );
  if (!p) return;
  // use p.source / p.tag
};
```

State: `providerId: string | null` instead of `ImportProvider | null`.

Grid renders both `available` + `coming-soon`:

- `available` → Import button calls `openUpload(p.id)`
- `coming-soon` → muted opacity + disabled button labeled "Coming soon" (no interaction)

Follows CLAUDE.md design rules: no borders/shadows on cards, tonal `bg-muted/40`, background shift for state.

## Coming Soon card visual

```tsx
<div className="rounded-xl bg-muted/40 p-6 opacity-60">
  <div className="mb-4 flex items-center gap-3">
    <Logo className={`h-6 w-6 shrink-0 ${p.logoClassName}`} />
    <h3 className="text-base font-medium text-foreground">{p.label}</h3>
  </div>
  <p className="mb-5 text-sm text-muted-foreground">{p.description}</p>
  <Button type="button" disabled>
    Coming soon
  </Button>
</div>
```

## Parsers (Grok + DeepSeek) — flexible pattern like Claude parser

Both export JSON conversations; exact schema undocumented publicly. Reuse Claude parser's defensive style: try multiple field names, handle multiple message shapes, fall back gracefully.

**Shared approach per parser file:**

- `parseXxxExportBuffer(buf)` → try ZIP extraction via `fflate.unzipSync`; if JSON file found parse it, else decode buffer as UTF-8 JSON
- `parseXxxExportJsonText(text)` → JSON.parse → collect conversations (array or `{conversations: [...]}` wrapper) → for each: pick title (`title`/`name`/`subject`), pick messages (`messages`/`chat_messages`/`history`/`turns`), pick stableId (`id`/`uuid`/`conversation_id`)
- Per message: role (`role`/`author.role`/`sender`) normalized to User/Assistant/System/Other; text (`content` string, `content.text`, `content.parts[]`, `text`, `message`)
- Format transcript `Role:\ntext\n\nRole:\ntext`
- Return `{ ok: true, rows }` or `{ ok: false, error }` matching `ParseResult`

Reuse `isString`/`isRecord`/`isNumber` from `_utils/guards.ts`. Reuse `ExportImportRow` from `_utils/importRows.ts`.

**Caveat to note when implementing:** parsers are best-effort until we verify against real exports. If format differs in practice, tweak field-name lookups — no structural change needed.

## Logo SVGs

Use simple-icons-compatible `viewBox="0 0 24 24"` + single `<path fill="currentColor">` matching existing OpenAiLogo/ClaudeLogo pattern. Brand paths from the simple-icons public CDN (`currentColor` for theme compatibility):

- Gemini — Google Gemini star glyph (`#4285F4`)
- Grok — xAI minimalist mark (`currentColor`, adapts to theme)
- DeepSeek — whale glyph (`#4D6BFE`)
- Perplexity — swirl (`#20808D`)

## UploadImportModal refactor

Change prop from `provider: ImportProvider` (string) to `provider: AvailableProvider` (object). Read `provider.instructions` directly. Drop the internal `instructions` record. Caller in ImportPageClient passes the full provider object via `.find(...)`.

## Key files/utilities to reuse

- `apps/web/src/components/_utils/guards.ts` — `isString`, `isRecord`, `isNumber`
- `apps/web/src/components/_utils/importRows.ts` — `ExportImportRow`
- `apps/web/src/components/settings/SelectImportRowsModal.tsx` — unchanged, already provider-agnostic
- `packages/backend/convex/memoryApi.ts` — `createMemory` action, unchanged (just new source strings)
- `fflate` (already installed) — ZIP extraction

## Verification

1. `cd apps/web && npx tsc --noEmit` — zero type errors (no `any`/`unknown`/`as`/`!`)
2. Visit `/settings/import` — 6 cards render in responsive grid (2 cols md+): ChatGPT, Claude, Grok, DeepSeek (active) + Gemini, Perplexity (muted + disabled)
3. Click ChatGPT/Claude Import → existing flows still work (upload real exports, select rows, confirm → toast success, memories appear in library with correct source/tag)
4. Click Grok/DeepSeek Import → modal opens with correct instructions. Upload a JSON file; if parser matches real format, rows appear in Select modal. If not, friendly error toast.
5. Gemini/Perplexity cards show "Coming soon" button, no click handler
6. Check memories table in Convex dashboard: new imports have `source: "import:grok"` / `"import:deepseek"` and tags `["import", "grok"]` / `["import", "deepseek"]`

## Open questions

None — user confirmed providers (Gemini, Grok, DeepSeek, Perplexity), mixed strategy (full parsing for Grok/DeepSeek, Coming Soon for Gemini/Perplexity), and config-driven refactor.
