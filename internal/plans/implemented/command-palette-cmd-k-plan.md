# Command Palette (Cmd+K) — Plan

## Context

User wants a `cmdk` command palette in the web app, styled to match existing design. Most plumbing already exists: `cmdk` is installed, a shadcn-style wrapper (`CommandDialog`, `CommandInput`, `CommandGroup`, `CommandItem`, `CommandShortcut`, etc.) already lives at `packages/ui/src/ui/command.tsx` styled with `glass-panel-strong`. What's missing is the actual palette instance with hotkey binding, navigation, profile switching, and search. No global Cmd+K handler exists today.

## Decisions (confirmed with user)

- **Profile click** → `api.userSettings.setDefaultProfile({ source: "web", profileId })` (persists)
- **Memory click** → `navigate({ to: "/memories", search: { focus: <id>, view: "graph" } })` (no `/memories/$id` route exists)
- **Quick actions** (v1) → Toggle theme, Toggle sidebar only (no "New memory")
- **Search scope** → memories + wiki docs + skills (all three)

## Key discoveries shaping the plan

- `api.memoryApi.searchMemories` is an **`authAction`**, not a query → must use `useAction` + debounced `useEffect`, not `useQuery`. Returns `{ memories: [...], total }`.
- `api.wiki.search` is an `authQuery` with arg `{ queryText: v.string() }` → can use `useQuery(..., query.length >= 2 ? { queryText: query } : "skip")`.
- `api.skills.listMy` is an `authQuery` with no args → load once, filter client-side on `name` (small list).
- Wiki has a detail route `/wiki/$docId`. **Skills has no detail route** → clicking a skill hit navigates to `/skills`.
- `-searchParams.ts` for memories: `view: parseAsStringLiteral(["graph","list"]).withDefault("graph")`, `focus: parseAsString`, `q: parseAsString.withDefault("")`.
- Sidebar collapse state lives in `MainShell.tsx` via `useLocalStorage("sidebar-collapsed", false)` → pass the toggle fn as a prop to the palette to keep `MainShell` as single owner.

## Files

### Create

**`apps/web/src/components/CommandPalette.tsx`** — single file, target ~200 lines, inline group sub-components (mirrors `ProfileDropdown.tsx` pattern). Client component.

Shape:

```tsx
"use client";

import { useState, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useHotkey } from "@tanstack/react-hotkeys";
import { useAction, useMutation, useQuery, useConvexAuth } from "convex/react";
import { useTheme } from "next-themes";
import {
  CommandDialog, CommandInput, CommandList, CommandEmpty,
  CommandGroup, CommandItem, CommandShortcut, CommandSeparator,
} from "@vmem/ui";
import { IconSun, IconMoon, IconLayoutSidebar, IconUsers, ... } from "@tabler/icons-react";
import { api } from "@vmem/backend";
import { navGroups, settingsNavItems } from "@/components/sidebar/nav-config";
import type { FunctionReturnType } from "convex/server";
import type { Id } from "@vmem/backend/_generated/dataModel";

type MemoryHit = FunctionReturnType<typeof api.memoryApi.searchMemories>["memories"][number];
type WikiHit = FunctionReturnType<typeof api.wiki.search>[number];
type SkillItem = FunctionReturnType<typeof api.skills.listMy>[number];

interface Props {
  onToggleSidebar: () => void;
}

export function CommandPalette({ onToggleSidebar }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const { isAuthenticated } = useConvexAuth();

  useHotkey("Mod+K", () => setOpen((o) => !o), { preventDefault: true });

  // Reset query when closing.
  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) setQuery("");
  };

  // Profiles
  const profiles = useQuery(api.profiles.list, isAuthenticated ? {} : "skip");
  const setDefaultProfile = useMutation(api.userSettings.setDefaultProfile);

  // Skills (small list, client-side filter)
  const skills = useQuery(api.skills.listMy, isAuthenticated ? {} : "skip");

  // Wiki (server-side search, only when query long enough)
  const wikiHits = useQuery(
    api.wiki.search,
    isAuthenticated && query.length >= 2 ? { queryText: query } : "skip",
  );

  // Memories (action, debounced)
  const searchMemories = useAction(api.memoryApi.searchMemories);
  const [memoryHits, setMemoryHits] = useState<MemoryHit[]>([]);
  useEffect(() => {
    if (!isAuthenticated || query.length < 2) {
      setMemoryHits([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      const res = await searchMemories({ query, limit: 8, offset: 0 });
      if (!cancelled) setMemoryHits(res.memories);
    }, 180);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query, isAuthenticated, searchMemories]);

  const runAndClose = (fn: () => void) => {
    fn();
    setOpen(false);
  };

  // Filter skills client-side
  const filteredSkills = query.length >= 2
    ? (skills ?? []).filter((s) => s.name.toLowerCase().includes(query.toLowerCase()))
    : [];

  return (
    <CommandDialog open={open} onOpenChange={handleOpenChange}>
      <CommandInput
        placeholder="Search memories, wiki, skills, or jump to a page…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>

        {/* Navigation — always visible */}
        {navGroups.map((group) => (
          <CommandGroup key={group.title} heading={group.title}>
            {group.items.map((item) => (
              <CommandItem
                key={item.href}
                value={`nav ${item.label}`}
                onSelect={() => runAndClose(() => navigate({ to: item.href }))}
              >
                <item.icon />
                <span>{item.label}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        ))}

        {/* Settings nav */}
        <CommandGroup heading="Settings">
          {settingsNavItems.map((item) => (
            <CommandItem
              key={item.href}
              value={`settings ${item.label}`}
              onSelect={() => runAndClose(() => navigate({ to: item.href }))}
            >
              <item.icon />
              <span>{item.label}</span>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        {/* Profiles */}
        {profiles && profiles.length > 0 && (
          <CommandGroup heading="Switch Profile">
            {profiles.map((p) => (
              <CommandItem
                key={p._id}
                value={`profile ${p.name}`}
                onSelect={() => runAndClose(async () => {
                  await setDefaultProfile({ source: "web", profileId: p._id });
                })}
              >
                <span
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: p.color }}
                />
                <span>{p.name}</span>
                {p.teamId && <IconUsers className="ml-auto text-muted-foreground" />}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {/* Quick Actions */}
        <CommandGroup heading="Actions">
          <CommandItem
            value="action toggle theme"
            onSelect={() => runAndClose(() => setTheme(theme === "dark" ? "light" : "dark"))}
          >
            {theme === "dark" ? <IconSun /> : <IconMoon />}
            <span>Toggle theme</span>
          </CommandItem>
          <CommandItem
            value="action toggle sidebar"
            onSelect={() => runAndClose(onToggleSidebar)}
          >
            <IconLayoutSidebar />
            <span>Toggle sidebar</span>
            <CommandShortcut>⌘I</CommandShortcut>
          </CommandItem>
        </CommandGroup>

        {/* Memory results — only when typing */}
        {memoryHits.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Memories">
              {memoryHits.map((m) => (
                <CommandItem
                  key={m.id}
                  value={`memory ${m.title} ${m.id}`}
                  onSelect={() => runAndClose(() => navigate({
                    to: "/memories",
                    search: { focus: m.id, view: "graph", q: "" },
                  }))}
                >
                  <IconBrain />
                  <span className="truncate">{m.title}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {/* Wiki results */}
        {wikiHits && wikiHits.length > 0 && (
          <CommandGroup heading="Wiki">
            {wikiHits.map((w) => (
              <CommandItem
                key={w._id}
                value={`wiki ${w.title} ${w._id}`}
                onSelect={() => runAndClose(() => navigate({
                  to: "/wiki/$docId",
                  params: { docId: w._id },
                }))}
              >
                <IconNotebook />
                <span className="truncate">{w.title}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {/* Skills results */}
        {filteredSkills.length > 0 && (
          <CommandGroup heading="Skills">
            {filteredSkills.map((s) => (
              <CommandItem
                key={s._id}
                value={`skill ${s.name} ${s._id}`}
                onSelect={() => runAndClose(() => navigate({ to: "/skills" }))}
              >
                <IconBolt />
                <span className="truncate">{s.name}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
```

### Modify

**`apps/web/src/components/MainShell.tsx`** — mount `<CommandPalette onToggleSidebar={toggleSidebar} />` inside `<PageTitleProvider>`, passing existing `toggleSidebar` callback. 1-line addition + import.

**`packages/ui/src/index.ts`** (or whichever barrel the UI package exports through) — verify `CommandDialog`, `CommandInput`, `CommandList`, `CommandEmpty`, `CommandGroup`, `CommandItem`, `CommandShortcut`, `CommandSeparator` are exported. Add if missing.

## Reused, not recreated

- `packages/ui/src/ui/command.tsx` — all shadcn cmdk primitives, already styled
- `useHotkey` from `@tanstack/react-hotkeys` — pattern copied from `MainShell.tsx:19`
- `navGroups`, `settingsNavItems` from `apps/web/src/components/sidebar/nav-config.ts`
- `api.profiles.list`, `api.userSettings.setDefaultProfile` — same calls `ProfileDropdown` uses
- `api.memoryApi.searchMemories`, `api.wiki.search`, `api.skills.listMy` — existing Convex functions, untouched
- `next-themes` `useTheme` — already wired by theme provider
- `MainShell.tsx`'s `toggleSidebar` — passed as prop, no state duplication
- Memories nuqs params (`focus`, `view`) — already defined in `-searchParams.ts`

## Types

- `type MemoryHit = FunctionReturnType<typeof api.memoryApi.searchMemories>["memories"][number]`
- `type WikiHit = FunctionReturnType<typeof api.wiki.search>[number]`
- `type SkillItem = FunctionReturnType<typeof api.skills.listMy>[number]`
- No `any`, no `unknown`, no `as`, no `!`.

## Edge cases handled

- Unauthenticated: all Convex queries get `"skip"`, memory action early-returns.
- `query.length < 2`: no server calls fire; only nav/profiles/actions show.
- No profiles: group omits itself (guarded by `profiles && profiles.length > 0`).
- Empty results across all groups: `CommandEmpty` shows "No results."
- In-flight memory action + fast typing: `cancelled` flag prevents stale writes.
- Reopening palette: `query` reset to `""` in `onOpenChange`.

## Verification

1. Start the web dev server (only if user asks).
2. Visit any authenticated route (e.g., `/memories`).
3. Press **Cmd+K** (macOS) or **Ctrl+K** (Windows) → palette opens.
4. Press **Esc** → palette closes.
5. Type "mem" → memories group populates (after ~180ms debounce).
6. Click a memory → navigates to `/memories?focus=<id>&view=graph` and highlights it.
7. Click a wiki hit → navigates to `/wiki/<docId>`.
8. Click a nav item ("Chat") → navigates to `/chat`.
9. Click "Toggle theme" → theme flips, dialog closes.
10. Click "Toggle sidebar" → sidebar collapses/expands (same as Mod+I).
11. Click a non-default profile → default profile updates (visible in Settings → Profiles).
12. Run `cd packages/backend && npx convex codegen --typecheck enable` and `npx tsc` in `apps/web` — no new type errors.

## Unresolved

None — all 4 scope questions confirmed with user.
