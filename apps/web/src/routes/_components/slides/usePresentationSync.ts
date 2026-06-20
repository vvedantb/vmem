import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useUser } from "@clerk/clerk-react";
import { api } from "@vmem/backend";

/**
 * Live "follow the presenter" sync for the `/slides` deck (Teams-style, no
 * take-control). One person — the presenter — drives; everyone else either
 * follows live or detaches to browse on their own, then re-syncs.
 *
 * Who is the presenter? Whoever holds the secret `hostKey` for this session
 * code (returned once from `createSession`, kept in localStorage). That key
 * never reaches viewers, so only the presenter can move the deck.
 *
 * The slide is the only synced state — build-step animations replay locally
 * on every client (they are timer-driven, so they converge on their own).
 */

const PARTICIPANT_KEY_STORAGE = "vmem:presentation-participant-key";
const NAME_STORAGE = "vmem:presentation-name";
const hostKeyStorage = (code: string) => `vmem:presentation-host:${code}`;

const HEARTBEAT_INTERVAL_MS = 15_000;

/** Stable per-browser id for presence, minted once and persisted. */
function readParticipantKey(): string {
  if (typeof window === "undefined") return "";
  const existing = window.localStorage.getItem(PARTICIPANT_KEY_STORAGE);
  if (existing) return existing;
  const key = crypto.randomUUID();
  window.localStorage.setItem(PARTICIPANT_KEY_STORAGE, key);
  return key;
}

function readStoredName(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(NAME_STORAGE);
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
  const { user } = useUser();
  const hostDisplayName = user?.fullName ?? user?.firstName ?? "Presenter";

  const [participantKey] = useState(readParticipantKey);
  const [name, setNameState] = useState<string | null>(readStoredName);

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

  // Subscriptions: viewers watch the slide; the presenter watches presence.
  const session = useQuery(
    api.presentations.getSession,
    sessionCode && !isHost ? { code: sessionCode } : "skip",
  );
  const participants = useQuery(
    api.presentations.listParticipants,
    sessionCode && isHost ? { code: sessionCode } : "skip",
  );

  const createSessionMut = useMutation(api.presentations.createSession);
  const setSlideMut = useMutation(api.presentations.setSlide);
  const stopSharingMut = useMutation(api.presentations.stopSharing);
  const heartbeatMut = useMutation(api.presentations.heartbeat);

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

  // The presenter uses their account name; a viewer uses their entered name.
  const effectiveName = isHost ? hostDisplayName : name;

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
      const result = await createSessionMut({
        slide,
        hostName: hostDisplayName,
      });
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
  }, [createSessionMut, slide, hostDisplayName, updateSearch]);

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

  const setName = useCallback((value: string) => {
    const trimmed = value.trim() || "Guest";
    if (typeof window !== "undefined") {
      window.localStorage.setItem(NAME_STORAGE, trimmed);
    }
    setNameState(trimmed);
  }, []);

  // Presence heartbeat — one ping on entry, then every 15s while live.
  useEffect(() => {
    if (!sessionCode || !effectiveName || sessionState !== "live") return;
    const role = isHost ? "host" : "viewer";
    const ping = () => {
      void heartbeatMut({
        code: sessionCode,
        participantKey,
        name: effectiveName,
        role,
      }).catch(() => undefined);
    };
    ping();
    const id = window.setInterval(ping, HEARTBEAT_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [
    sessionCode,
    effectiveName,
    sessionState,
    isHost,
    participantKey,
    heartbeatMut,
  ]);

  const viewers = useMemo(
    () => (participants ?? []).filter((p) => p.role === "viewer"),
    [participants],
  );

  const shareUrl =
    sessionCode && typeof window !== "undefined"
      ? `${window.location.origin}/slides?session=${sessionCode}`
      : null;

  const needsName =
    !!sessionCode && !isHost && name === null && sessionState === "live";

  return {
    isHost,
    mode,
    sessionState,
    /** Presenter's display name (from the server) — for the follower bar. */
    hostName: session?.hostName ?? null,
    effectiveSlide,
    onNavigate,
    viewerCount: viewers.length,
    viewers: viewers.map((viewer) => ({
      participantKey: viewer.participantKey,
      name: viewer.name,
    })),
    needsName,
    setName,
    startSharing,
    stopSharing,
    backToLive,
    shareUrl,
    isStarting,
  };
}

export type PresentationSync = ReturnType<typeof usePresentationSync>;
