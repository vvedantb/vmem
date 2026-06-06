/**
 * Claude Web/Desktop opens GET /mcp with Accept: text/event-stream after OAuth.
 * Convex uses stateless POST-only MCP handling; this keepalive satisfies the
 * streamable HTTP handshake without a persistent in-memory session.
 *
 * Convex httpActions hard-stop at 600s. Close the stream early so clients
 * reconnect cleanly instead of hitting the platform timeout (ERROR logs).
 */
const KEEPALIVE_INTERVAL_MS = 25_000;
/** 9 min — 60s buffer under Convex's 600s httpAction limit. */
const SSE_MAX_DURATION_MS = 540_000;

export function mcpSseKeepaliveResponse(): Response {
  const encoder = new TextEncoder();
  let intervalId: ReturnType<typeof setInterval> | undefined;
  let closeTimeoutId: ReturnType<typeof setTimeout> | undefined;

  const stopTimers = () => {
    if (intervalId !== undefined) clearInterval(intervalId);
    if (closeTimeoutId !== undefined) clearTimeout(closeTimeoutId);
    intervalId = undefined;
    closeTimeoutId = undefined;
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(": connected\n\n"));
      intervalId = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          stopTimers();
        }
      }, KEEPALIVE_INTERVAL_MS);

      closeTimeoutId = setTimeout(() => {
        stopTimers();
        try {
          controller.close();
        } catch {
          // Client may have already disconnected.
        }
      }, SSE_MAX_DURATION_MS);
    },
    cancel() {
      stopTimers();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
