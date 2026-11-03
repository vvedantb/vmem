/** IPC channels between main and the settings window. preload.ts is the only renderer side. */
export const IPC = {
  getState: "state:get",
  stateChanged: "state:changed",
  saveSettings: "settings:set",
  /** Window → main: the sign-in state changed. */
  signedIn: "auth:signed-in",
  /** Main → window: send a session token. */
  tokenRequest: "auth:token-request",
  /** Window → main: a session token, or null. */
  tokenReply: "auth:token-reply",
} as const;
