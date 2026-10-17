import { createServer, type Server } from "node:http";
import { z } from "zod";

// The redirect target for sign-in: a one-shot HTTP server on 127.0.0.1 with a random port.

export const LOOPBACK_PATH = "/callback";
export const LOOPBACK_TIMEOUT_MS = 5 * 60_000;

const addressSchema = z.object({ port: z.number() });

const PAGE = (text: string): string =>
  `<!doctype html><meta charset="utf-8"><title>vmem</title><body style="font:16px system-ui;margin:3rem"><p>${text}</p></body>`;

export type Loopback = {
  /** The exact redirect_uri to register and send, for example http://127.0.0.1:51234/callback. */
  redirectUrl: string;
  /** Resolves with the authorisation code. `expectedState` is read when the request arrives, so it may be set later. */
  waitForCode: (
    expectedState: () => string | undefined,
    timeoutMs?: number,
  ) => Promise<string>;
  close: () => void;
};

/** Starts listening on 127.0.0.1 with a free port. Call close when the sign-in ends. */
export async function startLoopback(): Promise<Loopback> {
  let deliver: (result: { code: string } | { error: string }) => void = () =>
    undefined;
  let expected: () => string | undefined = () => undefined;
  let timer: NodeJS.Timeout | undefined;
  const html = { "content-type": "text/html; charset=utf-8" };
  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (req.method !== "GET" || url.pathname !== LOOPBACK_PATH) {
      res.writeHead(404).end();
      return;
    }
    const state = expected();
    const error = url.searchParams.get("error");
    const code = url.searchParams.get("code");
    // A request without the state we sent is not our redirect: ignore it and keep waiting.
    if (!state || url.searchParams.get("state") !== state) {
      res
        .writeHead(400, html)
        .end(
          PAGE(
            "This sign-in link is not valid. Go back to vmem and try again.",
          ),
        );
      return;
    }
    if (error || !code) {
      res
        .writeHead(200, html)
        .end(PAGE("Sign-in was not completed. You can close this window."));
      deliver({
        error: error ? "Sign-in was cancelled" : "Sign-in returned no code",
      });
      return;
    }
    res
      .writeHead(200, html)
      .end(PAGE("You can close this window and go back to vmem."));
    deliver({ code });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = addressSchema.parse(server.address());
  const close = (): void => {
    clearTimeout(timer);
    server.close();
    server.closeAllConnections();
  };
  return {
    redirectUrl: `http://127.0.0.1:${String(port)}${LOOPBACK_PATH}`,
    close,
    waitForCode: (expectedState, timeoutMs = LOOPBACK_TIMEOUT_MS) => {
      expected = expectedState;
      return new Promise<string>((resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error("Sign-in timed out")),
          timeoutMs,
        );
        deliver = (result) => {
          clearTimeout(timer);
          if ("code" in result) resolve(result.code);
          else reject(new Error(result.error));
        };
      });
    },
  };
}
