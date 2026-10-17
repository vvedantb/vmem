/** The preload bridge. Payloads cross the boundary as unknown and are parsed in desktop-state.ts. */
interface DesktopBridge {
  getState: () => Promise<unknown>;
  onState: (listener: (state: unknown) => void) => () => void;
  saveSettings: (patch: unknown) => Promise<unknown>;
  signIn: () => Promise<unknown>;
  signOut: () => Promise<unknown>;
}

interface Window {
  vmemDesktop: DesktopBridge;
}
