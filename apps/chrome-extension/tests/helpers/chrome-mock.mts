// shared chrome.runtime / storage / tabs stub for node:test files
// AI-generated (Claude), prompt: "reusable chrome mock for extension unit tests"
// Modified by me: storage areas, tabs query, scripting, cookies, commands

interface AlarmOpts {
  periodInMinutes?: number;
  scheduledTime?: number;
}

export type TabStub = {
  id?: number;
  url?: string;
  title?: string;
};

export type CookieStub = {
  name: string;
  domain: string;
  value?: string;
  path?: string;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "unspecified" | "no_restriction" | "lax" | "strict";
  session?: boolean;
  expirationDate?: number;
  partitionKey?: { topLevelSite?: string; hasCrossSiteAncestor?: boolean };
};

export type CookieChangeStub = {
  removed: boolean;
  cookie?: CookieStub;
};

export type ChromeMockState = {
  local: Record<string, unknown>;
  session: Record<string, unknown>;
  alarms: Map<string, AlarmOpts>;
  executeScriptCalls: Array<{ tabId: number; args: unknown[] }>;
  contextMenusCreated: Array<Record<string, unknown>>;
  cookieJar: CookieStub[];
  cookieSets: CookieStub[];
  cookieChangeListeners: Array<(changeInfo: CookieChangeStub) => void>;
  commandListeners: Array<(command: string) => void>;
  activeTab: TabStub | undefined;
};

function makeStorageArea(getArea: () => Record<string, unknown>) {
  return {
    async get(
      keys: string | string[] | Record<string, unknown>,
    ): Promise<Record<string, unknown>> {
      const area = getArea();
      if (typeof keys === "string") {
        return { [keys]: area[keys] };
      }
      if (Array.isArray(keys)) {
        const result: Record<string, unknown> = {};
        for (const key of keys) {
          if (key in area) result[key] = area[key];
        }
        return result;
      }
      return { ...keys, ...area };
    },
    async set(obj: Record<string, unknown>): Promise<void> {
      Object.assign(getArea(), obj);
    },
    async remove(keys: string | string[]): Promise<void> {
      const area = getArea();
      const list = Array.isArray(keys) ? keys : [keys];
      for (const key of list) {
        delete area[key];
      }
    },
  };
}

export function installChromeMock(): ChromeMockState {
  const state: ChromeMockState = {
    local: {},
    session: {},
    alarms: new Map(),
    executeScriptCalls: [],
    contextMenusCreated: [],
    cookieJar: [],
    cookieSets: [],
    cookieChangeListeners: [],
    commandListeners: [],
    activeTab: {
      id: 42,
      url: "https://example.com/page",
      title: "Example",
    },
  };

  Object.defineProperty(globalThis, "chrome", {
    configurable: true,
    value: {
      alarms: {
        async get(name: string): Promise<AlarmOpts | undefined> {
          return state.alarms.get(name);
        },
        async create(name: string, opts: AlarmOpts): Promise<void> {
          state.alarms.set(name, {
            ...opts,
            scheduledTime: Date.now() + (opts.periodInMinutes ?? 0) * 60_000,
          });
        },
        async clear(name: string): Promise<boolean> {
          return state.alarms.delete(name);
        },
        onAlarm: { addListener(): void {} },
      },
      storage: {
        local: makeStorageArea(() => state.local),
        session: makeStorageArea(() => state.session),
      },
      bookmarks: {
        onCreated: { addListener(): void {} },
        async getTree(): Promise<unknown[]> {
          return [];
        },
        async get(): Promise<unknown[]> {
          return [];
        },
      },
      history: {
        async search(): Promise<unknown[]> {
          return [];
        },
      },
      action: {
        async setBadgeText(): Promise<void> {},
        async setBadgeBackgroundColor(): Promise<void> {},
      },
      runtime: {
        id: "test-extension",
        getURL(p: string): string {
          return `chrome-extension://test-extension/${p}`;
        },
        getManifest(): {
          manifest_version: number;
          name: string;
          version: string;
        } {
          return { manifest_version: 3, name: "vmem", version: "0.1.0" };
        },
        sendMessage(): Promise<never> {
          return Promise.reject(new Error("no receiving end"));
        },
        onMessage: {
          addListener(): void {},
          removeListener(): void {},
        },
      },
      tabs: {
        async query(): Promise<TabStub[]> {
          return state.activeTab ? [state.activeTab] : [];
        },
        async captureVisibleTab(): Promise<string> {
          throw new Error("Cannot capture chrome:// or extension pages");
        },
      },
      scripting: {
        async executeScript(opts: {
          target: { tabId: number };
          args?: unknown[];
        }): Promise<unknown[]> {
          state.executeScriptCalls.push({
            tabId: opts.target.tabId,
            args: opts.args ?? [],
          });
          return [];
        },
      },
      contextMenus: {
        removeAll(cb?: () => void): void {
          state.contextMenusCreated.length = 0;
          cb?.();
        },
        create(opts: Record<string, unknown>): void {
          state.contextMenusCreated.push(opts);
        },
        onClicked: { addListener(): void {} },
      },
      cookies: {
        async get(details: { url: string; name: string }) {
          const hostname = new URL(details.url).hostname;
          return (
            state.cookieJar.find((cookie) => {
              if (cookie.name !== details.name) return false;
              if (cookie.partitionKey?.topLevelSite) return false;
              const domain = cookie.domain.startsWith(".")
                ? cookie.domain.slice(1)
                : cookie.domain;
              return hostname === domain || hostname.endsWith(`.${domain}`);
            }) ?? null
          );
        },
        async getAll(details: {
          name?: string;
          partitionKey?: { topLevelSite?: string };
        }) {
          return state.cookieJar.filter((cookie) => {
            if (details.name && cookie.name !== details.name) return false;
            if (
              details.partitionKey?.topLevelSite &&
              cookie.partitionKey?.topLevelSite !==
                details.partitionKey.topLevelSite
            ) {
              return false;
            }
            return true;
          });
        },
        async set(details: {
          url: string;
          name?: string;
          value?: string;
          path?: string;
          httpOnly?: boolean;
          secure?: boolean;
          sameSite?: CookieStub["sameSite"];
          expirationDate?: number;
        }) {
          const cookie: CookieStub = {
            name: details.name ?? "",
            domain: new URL(details.url).hostname,
            value: details.value,
            path: details.path,
            httpOnly: details.httpOnly,
            secure: details.secure,
            sameSite: details.sameSite,
            expirationDate: details.expirationDate,
          };
          state.cookieSets.push(cookie);
          state.cookieJar = state.cookieJar.filter(
            (existing) =>
              !(
                existing.name === cookie.name &&
                existing.domain === cookie.domain &&
                !existing.partitionKey
              ),
          );
          state.cookieJar.push(cookie);
        },
        onChanged: {
          addListener(fn: (changeInfo: CookieChangeStub) => void): void {
            state.cookieChangeListeners.push(fn);
          },
        },
      },
      commands: {
        onCommand: {
          addListener(fn: (command: string) => void): void {
            state.commandListeners.push(fn);
          },
        },
      },
    },
  });

  return state;
}
