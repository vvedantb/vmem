import { contextBridge, ipcRenderer } from "electron";

/** Narrow bridge for the settings page. Main validates every payload. */
contextBridge.exposeInMainWorld("vmemDesktop", {
  getSettings: (): Promise<unknown> => ipcRenderer.invoke("settings:get"),
  saveSettings: (patch: unknown): Promise<unknown> =>
    ipcRenderer.invoke("settings:set", patch),
});
