/** The preload bridge (src/preload.ts). Payloads from main cross as unknown and are parsed in desktop-state.ts. */
interface DesktopBridge {
  getState: () => Promise<unknown>;
  onState: (listener: (state: unknown) => void) => () => void;
  saveSettings: (patch: unknown) => Promise<unknown>;
  reportSignedIn: (signedIn: boolean) => void;
  answerTokenRequests: (getToken: () => Promise<string | null>) => void;
}

interface Window {
  vmemDesktop: DesktopBridge;
}
