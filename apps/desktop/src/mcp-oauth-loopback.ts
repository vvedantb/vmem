import {
  startLoopback as startSharedLoopback,
  type Loopback,
} from "@vvedantb/server";

// The redirect target for sign-in: a one-shot HTTP server on 127.0.0.1 with a random port, with vmem's pages.

/** Starts listening on 127.0.0.1 with a free port. Call close when the sign-in ends. */
export function startLoopback(): Promise<Loopback> {
  return startSharedLoopback({
    title: "vmem",
    messages: {
      invalid: "This sign-in link is not valid. Go back to vmem and try again.",
      success: "You can close this window and go back to vmem.",
    },
  });
}

export {
  LOOPBACK_PATH,
  LOOPBACK_TIMEOUT_MS,
  type Loopback,
} from "@vvedantb/server";
