import { z } from "zod";
import type { SettingsStore } from "./settings";

// Sign-in as main sees it. The session lives in the settings window (@clerk/electron/react). That window stays
// alive, hidden, while the app runs, so main can ask it for a fresh session token before each upload, also when
// the user never opens it. No Electron here: main passes `askWindow` and forwards the window's replies.

const claimsSchema = z.object({ iss: z.string(), sub: z.string().min(1) });
const signedInSchema = z.boolean();
const tokenReplySchema = z.string().nullable();

/** Longer than the window waits for sign-in to load (10 s in getToken), so a slow load still answers. */
export const TOKEN_REQUEST_TIMEOUT_MS = 15_000;

/**
 * True for a session token from vmem's instance: a JWT with the right issuer and a user. The signature and expiry
 * are not checked here. The vmem API verifies both with its own clock; a local clock can be wrong.
 */
export function isSessionToken(token: string, issuer: string): boolean {
  try {
    const payload = Buffer.from(token.split(".")[1] ?? "", "base64url");
    const claims = claimsSchema.parse(JSON.parse(payload.toString("utf8")));
    return claims.iss === issuer;
  } catch {
    return false;
  }
}

export interface SessionAuthDeps {
  settings: SettingsStore;
  /** The `iss` of session tokens from vmem's instance (sessionIssuer in clerk.ts). */
  issuer: string;
  /** Sends a token request to the settings window. Returns false when no window can answer. */
  askWindow: () => boolean;
  timeoutMs?: number;
}

export class SessionAuth {
  private pending: Promise<string | null> | null = null;
  private reply: ((token: string | null) => void) | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly deps: SessionAuthDeps) {}

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** The last state that the window reported. It survives a restart, so recording starts before the window loads. */
  isSignedIn(): boolean {
    return this.deps.settings.get().signedIn;
  }

  /**
   * From the window when its sign-in state changes. Sign-in also removes the API key that an older install saved.
   * A malformed message is dropped.
   */
  setSignedIn(raw: unknown): void {
    const parsed = signedInSchema.safeParse(raw);
    if (!parsed.success) return;
    const signedIn = parsed.data;
    const current = this.deps.settings.get();
    const dropKey = signedIn && current.apiKey !== "";
    if (current.signedIn === signedIn && !dropKey) return;
    this.deps.settings.update(
      signedIn ? { signedIn, apiKey: "" } : { signedIn },
    );
    this.notify();
  }

  /**
   * A session token from the window, or null: signed out, no window, sign-in not loaded (offline) or no answer in
   * time. Callers share one request at a time.
   */
  async sessionToken(): Promise<string | null> {
    if (!this.isSignedIn()) return null;
    if (this.pending === null) {
      const pending = this.request().finally(() => {
        if (this.pending === pending) this.pending = null;
      });
      this.pending = pending;
    }
    const token = await this.pending;
    return token !== null && isSessionToken(token, this.deps.issuer)
      ? token
      : null;
  }

  /** The window's answer to a token request. Late or malformed answers are dropped. */
  receiveToken(raw: unknown): void {
    const parsed = tokenReplySchema.safeParse(raw);
    this.reply?.(parsed.success ? parsed.data : null);
  }

  private request(): Promise<string | null> {
    return new Promise((resolve) => {
      const finish = (token: string | null): void => {
        clearTimeout(timer);
        this.reply = null;
        resolve(token);
      };
      const timer = setTimeout(
        () => finish(null),
        this.deps.timeoutMs ?? TOKEN_REQUEST_TIMEOUT_MS,
      );
      this.reply = finish;
      if (!this.deps.askWindow()) finish(null);
    });
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}
