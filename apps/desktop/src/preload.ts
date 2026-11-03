import { exposeClerkBridge } from "@clerk/electron/preload";
import { contextBridge, ipcRenderer } from "electron";
import { IPC } from "./ipc";

/** Narrow bridge for the settings window. Main validates every payload. */
contextBridge.exposeInMainWorld("vmemDesktop", {
  getState: (): Promise<unknown> => ipcRenderer.invoke(IPC.getState),
  /** Calls `listener` with each new state. Returns the unsubscribe function. */
  onState: (listener: (state: unknown) => void): (() => void) => {
    const handler = (_event: unknown, state: unknown): void => listener(state);
    ipcRenderer.on(IPC.stateChanged, handler);
    return () => ipcRenderer.removeListener(IPC.stateChanged, handler);
  },
  saveSettings: (patch: unknown): Promise<unknown> =>
    ipcRenderer.invoke(IPC.saveSettings, patch),
  /** Tells main whether the user is signed in. Main gates recording and uploads on it. */
  reportSignedIn: (signedIn: boolean): void =>
    ipcRenderer.send(IPC.signedIn, signedIn),
  /** Answers main's token requests with `getToken`. A failure (offline, still loading) answers null. */
  answerTokenRequests: (getToken: () => Promise<string | null>): void => {
    ipcRenderer.on(IPC.tokenRequest, () => {
      void getToken()
        .catch(() => null)
        .then((token) => ipcRenderer.send(IPC.tokenReply, token));
    });
  },
});

// Token cache and OAuth transport for @clerk/electron/react.
exposeClerkBridge();
