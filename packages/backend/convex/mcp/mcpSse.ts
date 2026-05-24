/**
 * Claude Web/Desktop opens GET /mcp with Accept: text/event-stream after OAuth.
 * Convex uses stateless POST-only MCP handling; this keepalive satisfies the
 * streamable HTTP handshake without a persistent in-memory session.
 */
export function mcpSseKeepaliveResponse(): Response {
  const encoder = new TextEncoder();
  let intervalId: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(": connected\n\n"));
      intervalId = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          if (intervalId !== undefined) clearInterval(intervalId);
        }
      }, 25_000);
    },
    cancel() {
      if (intervalId !== undefined) clearInterval(intervalId);
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
