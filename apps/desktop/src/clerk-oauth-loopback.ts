import { createServer } from "node:http";
import { z } from "zod";
import {
  SIGN_IN_PAGE_CSP,
  signInOutcome,
  signInPage,
} from "./clerk-oauth-page";

// Social sign-in sends the system browser back here, not to vmem://renderer/. A browser cannot show a custom-scheme
// URL as a page, so the tab would stay on the provider's last page. Over HTTP on 127.0.0.1 it lands on vmem's page.
// No Electron here: clerk-oauth-ipc.ts wires it in. It listens only while a sign-in waits. The port is fixed because
// the exact URL must be on the allowlist in the dashboard (Native applications → Allowlist for mobile SSO redirect).
// Bee uses 45789, so vmem uses 45790 and both apps can sign in on one computer.

export const CLERK_OAUTH_PORT = 45790;
export const CLERK_OAUTH_PATH = "/sso-callback";
export const CLERK_OAUTH_REDIRECT_URL = `http://127.0.0.1:${String(CLERK_OAUTH_PORT)}${CLERK_OAUTH_PATH}`;
/** How long a sign-in waits for the browser, as in @clerk/electron. */
export const CLERK_OAUTH_TIMEOUT_MS = 180_000;

function isHttpsUrl(url: string): boolean {
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

const providerUrlSchema = z.string().refine(isHttpsUrl);

const PAGE_HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store",
  "Content-Security-Policy": SIGN_IN_PAGE_CSP,
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

export interface ClerkOAuthLoopback {
  readonly redirectUrl: string;
  /**
   * The @clerk/electron transport contract: open the provider's https page in the browser and resolve with the URL
   * that the browser came back to. A cancel or error resolves too; the client reads the outcome from the URL.
   * `url` comes over IPC, so it is parsed here.
   */
  open(url: unknown): Promise<{ callbackUrl: string }>;
  /** Ends the waiting sign-in, if any, and stops listening. */
  cancel(): void;
}

export function createClerkOAuthLoopback(options: {
  openExternal: (url: string) => Promise<void>;
  /** data: URL of the app icon for the page. */
  logo?: string;
  port?: number;
  timeoutMs?: number;
}): ClerkOAuthLoopback {
  const port = options.port ?? CLERK_OAUTH_PORT;
  const timeoutMs = options.timeoutMs ?? CLERK_OAUTH_TIMEOUT_MS;
  const origin = `http://127.0.0.1:${String(port)}`;
  // At most one sign-in waits at a time. Every ending clears it, so the next sign-in starts clean.
  let waiting: { fail(error: Error): void } | null = null;

  function open(url: unknown): Promise<{ callbackUrl: string }> {
    if (waiting) {
      return Promise.reject(
        new Error("Sign-in is already in progress in your browser."),
      );
    }
    const providerUrl = providerUrlSchema.safeParse(url);
    if (!providerUrl.success) {
      return Promise.reject(new Error("Sign-in can only open an https link."));
    }

    return new Promise((resolve, reject) => {
      const flow = {
        succeed(callbackUrl: string): void {
          if (waiting !== flow) return;
          waiting = null;
          clearTimeout(timer);
          resolve({ callbackUrl });
        },
        fail(error: Error): void {
          if (waiting !== flow) return;
          waiting = null;
          clearTimeout(timer);
          server.close();
          reject(error);
        },
      };
      waiting = flow;
      const timer = setTimeout(
        () => flow.fail(new Error("Sign-in timed out. Try again.")),
        timeoutMs,
      );

      const server = createServer((req, res) => {
        let requestUrl: URL;
        try {
          requestUrl = new URL(req.url ?? "/", origin);
        } catch {
          requestUrl = new URL("/", origin);
        }
        if (req.method !== "GET" || requestUrl.pathname !== CLERK_OAUTH_PATH) {
          res
            .writeHead(404, { "Content-Type": "text/plain; charset=utf-8" })
            .end("Not found");
          return;
        }
        // The result is in the query. A fragment never reaches a server, and the client does not read one.
        const callbackUrl = `${origin}${requestUrl.pathname}${requestUrl.search}`;
        // Stop listening once the page is sent. Closing earlier would cut the response short.
        res.once("close", () => server.close());
        res
          .writeHead(200, PAGE_HEADERS)
          .end(signInPage(signInOutcome(callbackUrl), options.logo));
        flow.succeed(callbackUrl);
      });
      server.on("error", (error: NodeJS.ErrnoException) => {
        flow.fail(
          error.code === "EADDRINUSE"
            ? new Error(
                `vmem could not start sign-in: port ${String(port)} is in use.`,
                { cause: error },
              )
            : error,
        );
      });
      server.listen(port, "127.0.0.1", () => {
        // Cancelled while the port was opening.
        if (waiting !== flow) {
          server.close();
          return;
        }
        // Through a promise, so a synchronous throw also fails the sign-in.
        Promise.resolve()
          .then(() => options.openExternal(providerUrl.data))
          .catch((error: unknown) =>
            flow.fail(
              error instanceof Error ? error : new Error(String(error)),
            ),
          );
      });
    });
  }

  return {
    redirectUrl: `${origin}${CLERK_OAUTH_PATH}`,
    open,
    cancel: () => waiting?.fail(new Error("Sign-in was cancelled.")),
  };
}
