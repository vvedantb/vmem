import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Button, cn } from "@vmem/ui";
import {
  IconShare2,
  IconLoader2,
  IconEye,
  IconArrowBackUp,
} from "@tabler/icons-react";
import type { PresentationSync } from "../usePresentationSync";
import { PresentationHostBar } from "./PresentationHostBar";

interface PresentationControlsProps {
  sync: PresentationSync;
}

/** Shared pill styling (floating overlay → shadow is allowed here). */
const PILL =
  "inline-flex items-center gap-2 rounded-full bg-surface-secondary/90 px-3.5 py-2 text-sm text-foreground shadow-lg backdrop-blur";

/**
 * Top-right overlay for the slide-share feature. Auto-hides ~3s after the
 * last activity (like a video player) so it never sits over the slides.
 * Renders one of: Share (solo) · presenter bar · follower / private / ended
 * pill. The wrapper is click-through; only the pill itself is interactive, so
 * the deck's click-to-navigate still works across the top strip.
 */
export function PresentationControls({ sync }: PresentationControlsProps) {
  const [revealed, setRevealed] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    let timer: number | undefined;
    const show = () => {
      setRevealed(true);
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => setRevealed(false), 3000);
    };
    show();
    window.addEventListener("mousemove", show);
    window.addEventListener("keydown", show);
    return () => {
      window.removeEventListener("mousemove", show);
      window.removeEventListener("keydown", show);
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  const visible = revealed || menuOpen;
  const { sessionState, isHost, mode } = sync;

  let body: ReactNode;
  if (sessionState === "none") {
    body = (
      <Button
        size="sm"
        variant="secondary"
        className="shadow-lg"
        onClick={() => void sync.startSharing()}
        disabled={sync.isStarting}
      >
        {sync.isStarting ? (
          <IconLoader2 size={15} className="animate-spin" />
        ) : (
          <IconShare2 size={15} />
        )}
        Share
      </Button>
    );
  } else if (isHost) {
    body = <PresentationHostBar sync={sync} onOpenChange={setMenuOpen} />;
  } else if (sessionState === "ended") {
    body = <div className={PILL}>Presentation ended</div>;
  } else if (sessionState === "notfound") {
    body = <div className={PILL}>Presentation not found</div>;
  } else if (sessionState === "loading") {
    body = <div className={cn(PILL, "text-muted")}>Connecting…</div>;
  } else if (mode === "private") {
    body = (
      <div className="inline-flex items-center gap-2 rounded-full bg-surface-secondary/90 py-1 pl-3.5 pr-1 text-sm text-foreground shadow-lg backdrop-blur">
        <span>Viewing on your own</span>
        <Button size="sm" variant="secondary" onClick={sync.backToLive}>
          <IconArrowBackUp size={15} /> Back to live
        </Button>
      </div>
    );
  } else {
    body = (
      <div className={PILL}>
        <IconEye size={15} className="text-muted" />
        Following · live
      </div>
    );
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-end p-4">
      <div
        className={cn(
          "transition-opacity duration-300",
          visible ? "pointer-events-auto opacity-100" : "opacity-0",
        )}
      >
        {body}
      </div>
    </div>
  );
}
