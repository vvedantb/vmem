import { resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { frontendApiHost } from "./clerk";

// Serves vmem://renderer/* from dist/renderer with a CSP header. No Electron here: main passes net.fetch and
// registers the handler with protocol.handle. Ported from Bee, without its Vite dev server proxy.

/** The sign-in UI loads from the Frontend API host at runtime, so the CSP must allow it (see @clerk/electron README). */
export function rendererCsp(key: string): string {
  const fapi = `https://${frontendApiHost(key)}`;
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline' ${fapi} https://challenges.cloudflare.com`,
    `connect-src 'self' ${fapi}`,
    "img-src 'self' https://img.clerk.com data:",
    "style-src 'self' 'unsafe-inline'",
    "worker-src 'self' blob:",
    "frame-src 'self' https://challenges.cloudflare.com",
    "form-action 'self'",
  ].join("; ");
}

/** The file for a request path, or null when the path is malformed or leaves `rendererDir`. `/` is index.html. */
export function rendererFile(rendererDir: string, url: URL): string | null {
  let path: string;
  try {
    path = decodeURIComponent(
      url.pathname === "/" ? "/index.html" : url.pathname,
    );
  } catch {
    return null;
  }
  const file = resolve(rendererDir, `.${path}`);
  return file.startsWith(rendererDir + sep) ? file : null;
}

export function createRendererHandler(options: {
  rendererDir: string;
  publishableKey: string;
  /** net.fetch in main: reads a file: URL. */
  fetchFile: (url: string) => Promise<Response>;
}): (request: Request) => Promise<Response> {
  const csp = rendererCsp(options.publishableKey);
  const rendererDir = resolve(options.rendererDir);
  return async (request) => {
    const file = rendererFile(rendererDir, new URL(request.url));
    const response =
      file === null
        ? new Response("Not found", { status: 404 })
        : await options.fetchFile(pathToFileURL(file).toString());
    const headers = new Headers(response.headers);
    headers.set("Content-Security-Policy", csp);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };
}
