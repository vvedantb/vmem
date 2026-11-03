import { request, type IncomingHttpHeaders } from "node:http";
import { createServer } from "node:net";
import { z } from "zod";

const addressSchema = z.object({ port: z.number() });

/** A port that was free a moment ago. */
export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = addressSchema.parse(server.address());
      server.close(() => resolve(port));
    });
  });
}

export interface Reply {
  status: number;
  headers: IncomingHttpHeaders;
  body: string;
}

/** One request on a fresh connection, so no kept-alive socket hides a closed server. */
export function send(url: string, method = "GET"): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const req = request(
      url,
      { method, agent: false, headers: { connection: "close" } },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => (body += chunk));
        res.on("end", () =>
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body }),
        );
      },
    );
    req.on("error", reject);
    req.end();
  });
}

/** True when nothing listens at `url`. */
export async function refused(url: string): Promise<boolean> {
  try {
    await send(url);
    return false;
  } catch {
    return true;
  }
}

/** Calls `check` until it stops throwing, then returns its value. Fails after `timeoutMs`. */
export async function waitFor<T>(
  check: () => T | Promise<T>,
  timeoutMs = 2_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      return await check();
    } catch (error) {
      if (Date.now() > deadline) throw error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
}
