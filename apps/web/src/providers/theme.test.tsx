// @vitest-environment happy-dom
// Pins the theme provider exactly as ClientProvider configures it: storage
// writes, <html> class + colorScheme for light/dark/system, forced landing
// theme, and ThemeContext toggle/server sync.
import { act, useSyncExternalStore } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  mount,
  recordStorage,
  resetDocument,
  stubSystemDark,
  type Mounted,
} from "@/test/dom";
import { ThemeProvider, useTheme } from "./theme";

// Server settings store; `update` applies the optimistic patch like Convex.
const convex = vi.hoisted(() => {
  type Settings = { theme?: string } | undefined;
  const listeners = new Set<() => void>();
  const settings: { current: Settings } = { current: undefined };
  return {
    settings,
    subscribe: (fn: () => void) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    update: vi.fn(async (args: { theme: string }) => {
      settings.current = { ...settings.current, ...args };
      for (const fn of listeners) fn();
      return null;
    }),
  };
});

vi.mock("@vmem/backend", () => ({
  api: {
    userSettings: { get: "userSettings.get", update: "userSettings.update" },
  },
}));
vi.mock("@/lib/convex-optimistic", () => ({ patchUserSettingsGet: () => {} }));
vi.mock("convex/react", () => ({
  useQuery: () =>
    useSyncExternalStore(convex.subscribe, () => convex.settings.current),
  useMutation: () => ({ withOptimisticUpdate: () => convex.update }),
}));

const { ThemeProvider: ThemeContextProvider, useThemeContext } =
  await import("@/contexts/ThemeContext");

type ThemeState = ReturnType<typeof useTheme>;
const seen: { current: ThemeState | null } = { current: null };

function record(value: ThemeState) {
  seen.current = value;
}

function Probe() {
  record(useTheme());
  return null;
}

function current(): ThemeState {
  if (!seen.current) throw new Error("probe did not render");
  return seen.current;
}

// Same props as ClientProvider.
function AppTheme({
  isLanding = false,
  children,
}: {
  isLanding?: boolean;
  children: React.ReactNode;
}) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={!isLanding}
      forcedTheme={isLanding ? "dark" : undefined}
      disableTransitionOnChange
    >
      {children}
    </ThemeProvider>
  );
}

const html = () => document.documentElement;
let mounted: Mounted | null = null;
let writes: Array<[string, string]> = [];

beforeEach(() => {
  writes = recordStorage();
  resetDocument();
  html().classList.add("keep-me");
  seen.current = null;
  convex.settings.current = undefined;
  convex.update.mockClear();
});

afterEach(async () => {
  await mounted?.unmount();
  mounted = null;
  vi.restoreAllMocks();
});

describe("app ThemeProvider", () => {
  const storedThemes: Array<"light" | "dark"> = ["light", "dark"];
  it.each(storedThemes)(
    "applies stored %s without writing storage",
    async (stored) => {
      stubSystemDark(stored === "light");
      localStorage.setItem("theme", stored);
      writes.length = 0;
      mounted = await mount(
        <AppTheme>
          <Probe />
        </AppTheme>,
      );
      expect(html().className).toBe(`keep-me ${stored}`);
      expect(html().style.colorScheme).toBe(stored);
      expect(current().theme).toBe(stored);
      expect(current().resolvedTheme).toBe(stored);
      expect(current().themes).toEqual(["light", "dark", "system"]);
      expect(writes).toEqual([]);
    },
  );

  it("defaults to light when nothing is stored", async () => {
    stubSystemDark(true);
    mounted = await mount(
      <AppTheme>
        <Probe />
      </AppTheme>,
    );
    expect(html().className).toBe("keep-me light");
    expect(html().style.colorScheme).toBe("light");
    expect(current().theme).toBe("light");
    expect(current().systemTheme).toBe("dark");
    expect(writes).toEqual([]);
  });

  const systemCases: Array<[boolean, "light" | "dark"]> = [
    [true, "dark"],
    [false, "light"],
  ];
  it.each(systemCases)(
    "system with OS dark=%s resolves %s",
    async (osDark, resolved) => {
      stubSystemDark(osDark);
      localStorage.setItem("theme", "system");
      mounted = await mount(
        <AppTheme>
          <Probe />
        </AppTheme>,
      );
      expect(html().className).toBe(`keep-me ${resolved}`);
      expect(html().style.colorScheme).toBe(resolved);
      expect(current().theme).toBe("system");
      expect(current().resolvedTheme).toBe(resolved);
      expect(current().systemTheme).toBe(resolved);
    },
  );

  it("follows OS changes while on system", async () => {
    const setOsDark = stubSystemDark(false);
    localStorage.setItem("theme", "system");
    mounted = await mount(
      <AppTheme>
        <Probe />
      </AppTheme>,
    );
    await act(async () => setOsDark(true));
    expect(html().className).toBe("keep-me dark");
    expect(current().resolvedTheme).toBe("dark");
  });

  it("setTheme writes the raw value to the theme key", async () => {
    stubSystemDark(true);
    mounted = await mount(
      <AppTheme>
        <Probe />
      </AppTheme>,
    );
    await act(async () => current().setTheme("dark"));
    expect(localStorage.getItem("theme")).toBe("dark");
    expect(html().className).toBe("keep-me dark");
    expect(html().style.colorScheme).toBe("dark");

    await act(async () => current().setTheme("light"));
    expect(localStorage.getItem("theme")).toBe("light");
    expect(html().className).toBe("keep-me light");

    await act(async () => current().setTheme("system"));
    expect(localStorage.getItem("theme")).toBe("system");
    expect(html().className).toBe("keep-me dark");
    expect(current().resolvedTheme).toBe("dark");
    expect(writes).toEqual([
      ["theme", "dark"],
      ["theme", "light"],
      ["theme", "system"],
    ]);
  });

  it("landing forces dark over a stored light preference", async () => {
    stubSystemDark(false);
    localStorage.setItem("theme", "light");
    mounted = await mount(
      <AppTheme isLanding>
        <Probe />
      </AppTheme>,
    );
    expect(html().className).toBe("keep-me dark");
    expect(html().style.colorScheme).toBe("dark");
    expect(current().forcedTheme).toBe("dark");
    expect(current().theme).toBe("light");
    expect(current().resolvedTheme).toBe("light");
    expect(current().themes).toEqual(["light", "dark"]);
    expect(current().systemTheme).toBeUndefined();
    expect(writes).toEqual([["theme", "light"]]);
  });

  it("leaving landing restores the stored theme", async () => {
    stubSystemDark(false);
    localStorage.setItem("theme", "light");
    mounted = await mount(
      <AppTheme isLanding>
        <Probe />
      </AppTheme>,
    );
    await mounted.rerender(
      <AppTheme>
        <Probe />
      </AppTheme>,
    );
    expect(html().className).toBe("keep-me light");
    expect(html().style.colorScheme).toBe("light");
  });

  it("useTheme outside the provider is inert", async () => {
    mounted = await mount(<Probe />);
    expect(current().theme).toBeUndefined();
    expect(current().resolvedTheme).toBeUndefined();
    expect(current().themes).toEqual([]);
    expect(() => current().setTheme("dark")).not.toThrow();
    expect(localStorage.getItem("theme")).toBeNull();
  });
});

describe("ThemeContext on the app ThemeProvider", () => {
  type Ctx = ReturnType<typeof useThemeContext>;
  const ctx: { current: Ctx | null } = { current: null };
  const recordCtx = (value: Ctx) => {
    ctx.current = value;
  };
  function CtxProbe() {
    recordCtx(useThemeContext());
    return null;
  }
  const value = (): Ctx => {
    if (!ctx.current) throw new Error("ctx probe did not render");
    return ctx.current;
  };
  const tree = (
    <AppTheme>
      <ThemeContextProvider>
        <CtxProbe />
      </ThemeContextProvider>
    </AppTheme>
  );

  it("syncs the server theme into storage once settings load", async () => {
    stubSystemDark(false);
    convex.settings.current = { theme: "dark" };
    mounted = await mount(tree);
    expect(localStorage.getItem("theme")).toBe("dark");
    expect(html().className).toBe("keep-me dark");
    expect(value()).toMatchObject({ theme: "dark", isDark: true });
  });

  it("missing server theme syncs as system", async () => {
    stubSystemDark(true);
    localStorage.setItem("theme", "light");
    convex.settings.current = {};
    mounted = await mount(tree);
    expect(localStorage.getItem("theme")).toBe("system");
    expect(html().className).toBe("keep-me dark");
    expect(value()).toMatchObject({ theme: "system", isDark: true });
  });

  it("toggle flips the resolved theme and saves it", async () => {
    stubSystemDark(false);
    convex.settings.current = { theme: "light" };
    mounted = await mount(tree);
    expect(value().isDark).toBe(false);

    await act(async () => value().toggleTheme());
    expect(localStorage.getItem("theme")).toBe("dark");
    expect(html().className).toBe("keep-me dark");
    expect(value().isDark).toBe(true);
    expect(convex.update).toHaveBeenLastCalledWith({ theme: "dark" });

    await act(async () => value().toggleTheme());
    expect(localStorage.getItem("theme")).toBe("light");
    expect(html().className).toBe("keep-me light");
    expect(convex.update).toHaveBeenLastCalledWith({ theme: "light" });
  });

  it("setTheme(system) stores system and resolves from the OS", async () => {
    stubSystemDark(true);
    convex.settings.current = { theme: "light" };
    mounted = await mount(tree);
    await act(async () => value().setTheme("system"));
    expect(localStorage.getItem("theme")).toBe("system");
    expect(html().className).toBe("keep-me dark");
    expect(value().isDark).toBe(true);
    expect(convex.update).toHaveBeenLastCalledWith({ theme: "system" });
  });

  it("throws outside ThemeProvider", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(mount(<CtxProbe />)).rejects.toThrow(
      "useThemeContext must be used within a ThemeProvider",
    );
  });
});
