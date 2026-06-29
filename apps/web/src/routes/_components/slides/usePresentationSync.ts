import { useCallback, useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@vmem/backend";

/**
 * Live "follow the presenter" sync for the `/slides` deck (Teams-style, no
 * take-control, anonymous viewers). One person — the presenter — drives;
 * everyone else either follows live or detaches to browse on their own.
 *
 * The presenter is whoever holds the secret `hostKey` for this session code
 * (returned once from `createSession`, kept in localStorage). That key never
 * reaches viewers, so only the presenter can move the deck.
 *
 * The slide is the only synced state — build-step animations replay locally on
 * every client (timer-driven, so they converge). `participantKey` is exposed
 * for poll voting (one vote per browser).
 */

const PARTICIPANT_KEY_STORAGE = "vmem:presentation-participant-key";
const hostKeyStorage = (code: string) => `vmem:presentation-host:${code}`;

/** Stable per-browser id (votes are one-per-participant), minted once. */
function readParticipantKey(): string {
  if (typeof window === "undefined") return "";
  const existing = window.localStorage.getItem(PARTICIPANT_KEY_STORAGE);
  if (existing) return existing;
  const key = crypto.randomUUID();
  window.localStorage.setItem(PARTICIPANT_KEY_STORAGE, key);
  return key;
}

interface UsePresentationSyncArgs {
  /** Current slide from the URL (`?slide=`). */
  slide: number;
  /** Share code from the URL (`?session=`), if any. */
  sessionCode: string | undefined;
  /** Patch the URL search params (slide and/or session). */
  updateSearch: (next: { slide?: number; session?: string }) => void;
}

/** Viewer-facing lifecycle of the session being watched. */
export type SessionState =
  | "none" // not sharing — solo deck
  | "loading" // joined, awaiting first server read
  | "live" // active, presenter driving
  | "ended" // presenter stopped sharing
  | "notfound"; // code has no session (expired / invalid)

export function usePresentationSync({
  slide,
  sessionCode,
  updateSearch,
}: UsePresentationSyncArgs) {
  const [participantKey] = useState(readParticipantKey);

  // Per-session host token. Present == this browser is the presenter. Read
  // synchronously on mount (so a host reload doesn't flash the viewer UI), and
  // re-read whenever the session code changes (start / stop sharing).
  const [hostKey, setHostKey] = useState<string | null>(() =>
    typeof window !== "undefined" && sessionCode
      ? window.localStorage.getItem(hostKeyStorage(sessionCode))
      : null,
  );
  useEffect(() => {
    if (typeof window === "undefined" || !sessionCode) {
      setHostKey(null);
      return;
    }
    setHostKey(window.localStorage.getItem(hostKeyStorage(sessionCode)));
  }, [sessionCode]);
  const isHost = hostKey !== null;

  // Viewer view-mode; resets to "following" whenever the session changes.
  const [mode, setMode] = useState<"following" | "private">("following");
  useEffect(() => {
    setMode("following");
  }, [sessionCode]);

  // Viewers subscribe to the live slide; the presenter drives via the URL.
  const session = useQuery(
    api.presentations.getSession,
    sessionCode && !isHost ? { code: sessionCode } : "skip",
  );

  const createSessionMut = useMutation(api.presentations.createSession);
  const setSlideMut = useMutation(api.presentations.setSlide);
  const stopSharingMut = useMutation(api.presentations.stopSharing);

  const [isStarting, setIsStarting] = useState(false);

  const sessionState: SessionState = !sessionCode
    ? "none"
    : isHost
      ? "live"
      : session === undefined
        ? "loading"
        : session === null
          ? "notfound"
          : session.status;

  const isFollowing =
    !isHost && mode === "following" && sessionState === "live";
  // Following → render the presenter's slide; otherwise the local URL slide.
  const effectiveSlide =
    isFollowing && session && session.status === "live" ? session.slide : slide;

  // Navigation intent from the deck (keys / clicks).
  const onNavigate = useCallback(
    (target: number) => {
      if (isHost && hostKey && sessionCode) {
        updateSearch({ slide: target });
        void setSlideMut({ code: sessionCode, hostKey, slide: target }).catch(
          () => undefined,
        );
        return;
      }
      // A following viewer who navigates detaches into private browsing.
      if (sessionCode && mode === "following") {
        setMode("private");
      }
      updateSearch({ slide: target });
    },
    [isHost, hostKey, sessionCode, mode, updateSearch, setSlideMut],
  );

  const startSharing = useCallback(async () => {
    setIsStarting(true);
    try {
      const result = await createSessionMut({ slide });
      if (typeof window !== "undefined") {
        window.localStorage.setItem(
          hostKeyStorage(result.code),
          result.hostKey,
        );
      }
      setHostKey(result.hostKey);
      updateSearch({ session: result.code });
    } finally {
      setIsStarting(false);
    }
  }, [createSessionMut, slide, updateSearch]);

  const stopSharing = useCallback(async () => {
    if (!sessionCode || !hostKey) return;
    await stopSharingMut({ code: sessionCode, hostKey }).catch(() => undefined);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(hostKeyStorage(sessionCode));
    }
    setHostKey(null);
    updateSearch({ session: undefined });
  }, [sessionCode, hostKey, stopSharingMut, updateSearch]);

  const backToLive = useCallback(() => {
    setMode("following");
  }, []);

  const shareUrl =
    sessionCode && typeof window !== "undefined"
      ? `${window.location.origin}/slides?session=${sessionCode}`
      : null;

  return {
    isHost,
    mode,
    sessionState,
    effectiveSlide,
    onNavigate,
    /** Stable per-browser id — passed to poll slides for one-vote-per-browser. */
    participantKey,
    /** Secret host token when this browser is the presenter. */
    hostKey,
    startSharing,
    stopSharing,
    backToLive,
    shareUrl,
    isStarting,
  };
}

export type PresentationSync = ReturnType<typeof usePresentationSync>;
