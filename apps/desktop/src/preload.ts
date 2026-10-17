import { contextBridge, ipcRenderer } from "electron";

/** Narrow bridge for the settings page. Main validates every payload. */
contextBridge.exposeInMainWorld("vmemDesktop", {
  getState: (): Promise<unknown> => ipcRenderer.invoke("state:get"),
  /** Calls `listener` with each new state. Returns the unsubscribe function. */
  onState: (listener: (state: unknown) => void): (() => void) => {
    const handler = (_event: unknown, state: unknown): void => listener(state);
    ipcRenderer.on("state:changed", handler);
    return () => ipcRenderer.removeListener("state:changed", handler);
  },
  saveSettings: (patch: unknown): Promise<unknown> =>
    ipcRenderer.invoke("settings:set", patch),
  signIn: (): Promise<unknown> => ipcRenderer.invoke("auth:sign-in"),
  signOut: (): Promise<unknown> => ipcRenderer.invoke("auth:sign-out"),
});
