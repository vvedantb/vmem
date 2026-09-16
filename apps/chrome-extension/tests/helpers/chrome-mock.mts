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

export type CookieChangeStub = {
  removed: boolean;
  cookie?: { name: string; domain: string };
};

export type ChromeMockState = {
  local: Record<string, unknown>;
  session: Record<string, unknown>;
  alarms: Map<string, AlarmOpts>;
  executeScriptCalls: Array<{ tabId: number; args: unknown[] }>;
  contextMenusCreated: Array<Record<string, unknown>>;
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
        onUpdated: { addListener(): void {} },
      },
      scripting: {
        async executeScript(opts: {
          target: { tabId: number };
          args?: unknown[];
          world?: string;
          func?: (...args: unknown[]) => unknown;
        }): Promise<Array<{ result?: unknown }>> {
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
