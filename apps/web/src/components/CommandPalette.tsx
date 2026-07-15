import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useHotkey } from "@tanstack/react-hotkeys";
import { useAction, useConvexAuth, useQuery } from "convex/react";
import { useDebounceValue } from "usehooks-ts";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@vmem/ui";
import {
  IconBolt,
  IconBrain,
  IconLayoutSidebar,
  IconMoon,
  IconNotebook,
  IconSun,
  IconUsers,
} from "@tabler/icons-react";
import { api } from "@vmem/backend";
import type { FunctionReturnType } from "convex/server";
import {
  navGroups,
  navHrefToPath,
  settingsNavGroups,
} from "@/components/sidebar/nav-config";
import { useActiveProfileId } from "@/components/workspace/active-profile";
import { workspacePathFor } from "@/components/workspace/workspace-paths";
import { useThemeContext } from "@/components/contexts/ThemeContext";

type MemoryHit = FunctionReturnType<
  typeof api.memoryApi.searchMemories
>["memories"][number];

interface Props {
  onToggleSidebar: () => void;
}

export function CommandPalette({ onToggleSidebar }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery] = useDebounceValue(query, 180);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const workspaceId = useActiveProfileId();
  const { theme, toggleTheme } = useThemeContext();
  const { isAuthenticated } = useConvexAuth();

  useHotkey("Mod+K", () => setOpen((o) => !o), { preventDefault: true });

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) setQuery("");
  };

  const profiles = useQuery(
    api.profiles.list,
    isAuthenticated && open ? {} : "skip",
  );

  const skills = useQuery(
    api.skills.listMy,
    isAuthenticated && open ? {} : "skip",
  );

  const wikiHits = useQuery(
    api.wiki.search,
    isAuthenticated && open && debouncedQuery.length >= 2
      ? { queryText: debouncedQuery }
      : "skip",
  );

  const searchMemories = useAction(api.memoryApi.searchMemories);
  const [memoryHits, setMemoryHits] = useState<MemoryHit[]>([]);

  useEffect(() => {
    if (!open || !isAuthenticated || debouncedQuery.length < 2) {
      setMemoryHits([]);
      return;
    }
    let cancelled = false;
    void searchMemories({ query: debouncedQuery, limit: 8, offset: 0 }).then(
      (res) => {
        if (!cancelled) setMemoryHits(res.memories);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [open, debouncedQuery, isAuthenticated, searchMemories]);

  const runAndClose = (fn: () => void) => {
    fn();
    setOpen(false);
  };

  // target within the active workspace, or `/home` (the workspace resolver) when none
  const workspaceTo = (subPath: string) =>
    workspaceId === undefined ? "/home" : `/${workspaceId}${subPath}`;

  const normalizedQuery = query.trim().toLowerCase();
  const filteredSkills =
    normalizedQuery.length >= 2
      ? (skills ?? []).filter(
          (s) =>
            s.enabled !== false &&
            s.name.toLowerCase().includes(normalizedQuery),
        )
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

        {navGroups.map((group) => (
          <CommandGroup key={group.title} heading={group.title}>
            {group.items.map((item) => {
              const Icon = item.icon;
              return (
                <CommandItem
                  key={item.href}
                  value={`nav ${item.label}`}
                  onSelect={() =>
                    runAndClose(() =>
                      navigate({ to: navHrefToPath(item.href, workspaceId) }),
                    )
                  }
                >
                  <Icon />
                  <span>{item.label}</span>
                </CommandItem>
              );
            })}
          </CommandGroup>
        ))}

        {settingsNavGroups.map((group) => (
          <CommandGroup key={group.title} heading={`Settings · ${group.title}`}>
            {group.items.map((item) => {
              const Icon = item.icon;
              return (
                <CommandItem
                  key={item.href}
                  value={`settings ${item.label}`}
                  onSelect={() =>
                    runAndClose(() => navigate({ to: item.href }))
                  }
                >
                  <Icon />
                  <span>{item.label}</span>
                </CommandItem>
              );
            })}
          </CommandGroup>
        ))}

        <CommandSeparator />

        {profiles && profiles.length > 0 && (
          <CommandGroup heading="Switch workspace">
            {profiles.map((p) => (
              <CommandItem
                key={p._id}
                value={`workspace ${p.name}`}
                onSelect={() =>
                  runAndClose(() =>
                    navigate({
                      to: workspacePathFor(
                        pathname,
                        p._id,
                        p.teamId !== undefined,
                      ),
                    }),
                  )
                }
              >
                <span
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: p.color }}
                />
                <span>{p.name}</span>
                {p.teamId && <IconUsers className="ml-auto text-muted" />}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        <CommandGroup heading="Actions">
          <CommandItem
            value="action toggle theme"
            onSelect={() => runAndClose(toggleTheme)}
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

        {memoryHits.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Memories">
              {memoryHits.map((m) => (
                <CommandItem
                  key={m.id}
                  value={`memory ${m.title} ${m.id}`}
                  onSelect={() =>
                    runAndClose(() =>
                      navigate({
                        to: workspaceTo("/memories/graph"),
                        search: (prev) => ({ ...prev, focus: m.id }),
                      }),
                    )
                  }
                >
                  <IconBrain />
                  <span className="truncate">{m.title}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {wikiHits && wikiHits.length > 0 && (
          <CommandGroup heading="Wiki">
            {wikiHits.map((w) => (
              <CommandItem
                key={w._id}
                value={`wiki ${w.title} ${w._id}`}
                onSelect={() =>
                  runAndClose(() =>
                    navigate({ to: workspaceTo(`/wiki/${w._id}`) }),
                  )
                }
              >
                <IconNotebook />
                <span className="truncate">{w.title}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {filteredSkills.length > 0 && (
          <CommandGroup heading="Skills">
            {filteredSkills.map((s) => (
              <CommandItem
                key={s._id}
                value={`skill ${s.name} ${s._id}`}
                onSelect={() =>
                  runAndClose(() =>
                    navigate({ to: workspaceTo(`/skills/${s._id}`) }),
                  )
                }
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
