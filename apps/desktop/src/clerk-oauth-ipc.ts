import { isRendererUrl } from "./clerk";
import { createClerkOAuthLoopback } from "./clerk-oauth-loopback";

// @clerk/electron's OAuth transport channels (OAUTH_TRANSPORT_CHANNELS; the package does not export them).
export const CLERK_OAUTH_CHANNELS = {
  getRedirectUrl: "clerk:oauth-transport:get-redirect-url",
  open: "clerk:oauth-transport:open",
} as const;

/** The part of an Electron invoke event that the sender check reads. */
export interface InvokeEvent {
  sender: { getType(): string; mainFrame: object };
  senderFrame: { url: string } | null;
}

/** The part of Electron's ipcMain that this module uses. Main passes the real one; tests pass a fake. */
export interface InvokeHandlers {
  handle(
    channel: string,
    listener: (event: InvokeEvent, arg: unknown) => unknown,
  ): void;
  removeHandler(channel: string): void;
}

/** The main frame of a window on vmem://renderer/. The bridge's own handlers check only for a main frame. */
export function fromRenderer(event: InvokeEvent): boolean {
  const frame = event.senderFrame;
  return (
    event.sender.getType() === "window" &&
    frame !== null &&
    frame === event.sender.mainFrame &&
    isRendererUrl(frame.url)
  );
}

/**
 * Replaces the OAuth handlers that createClerkBridge registered with ones that use the loopback page, so the browser
 * ends on vmem's page and not on the provider's. Call it right after createClerkBridge. The bridge's token-cache
 * handlers, vmem:// scheme and protocol client stay as they are. Returns a cleanup that ends a waiting sign-in.
 */
export function registerClerkOAuthIpc(options: {
  ipcMain: InvokeHandlers;
  openExternal: (url: string) => Promise<void>;
  /** Shows the settings window again once the browser comes back. */
  bringToFront: () => void;
  logo?: string;
  port?: number;
  timeoutMs?: number;
}): () => void {
  const { ipcMain, bringToFront, ...loopbackOptions } = options;
  const loopback = createClerkOAuthLoopback(loopbackOptions);
  for (const channel of Object.values(CLERK_OAUTH_CHANNELS)) {
    ipcMain.removeHandler(channel);
  }

  ipcMain.handle(CLERK_OAUTH_CHANNELS.getRedirectUrl, (event) => {
    if (!fromRenderer(event)) throw new Error("Not allowed");
    return loopback.redirectUrl;
  });

  // Electron logs a rejection ("Error occurred in handler for …") and passes it to the renderer.
  ipcMain.handle(CLERK_OAUTH_CHANNELS.open, async (event, url) => {
    if (!fromRenderer(event)) throw new Error("Not allowed");
    const result = await loopback.open(url);
    bringToFront();
    return result;
  });

  return () => {
    loopback.cancel();
    for (const channel of Object.values(CLERK_OAUTH_CHANNELS)) {
      ipcMain.removeHandler(channel);
    }
  };
}
