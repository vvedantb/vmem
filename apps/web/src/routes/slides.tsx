import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { useCallback, useMemo } from "react";
import { SlideDeck } from "./_components/slides/SlideDeck";
import { usePresentationSync } from "./_components/slides/usePresentationSync";
import { PresentationControls } from "./_components/slides/_components/PresentationControls";
import { PresentationDeckProvider } from "./_components/slides/_components/PresentationDeckContext";

const searchSchema = z.object({
  slide: z.number().int().min(1).optional().default(1),
  // Present when watching/driving a live share (see usePresentationSync).
  session: z.string().optional(),
});

export const Route = createFileRoute("/slides")({
  validateSearch: searchSchema,
  component: SlidesPage,
});

function SlidesPage() {
  const { slide, session } = Route.useSearch();
  const navigate = useNavigate({ from: "/slides" });

  const updateSearch = useCallback(
    (next: { slide?: number; session?: string }) => {
      void navigate({
        search: (prev) => ({ ...prev, ...next }),
        replace: true,
      });
    },
    [navigate],
  );

  const sync = usePresentationSync({
    slide,
    sessionCode: session,
    updateSearch,
  });

  const deckContext = useMemo(
    () => ({
      sessionCode: session,
      participantKey: sync.participantKey,
      hostKey: sync.hostKey,
    }),
    [session, sync.participantKey, sync.hostKey],
  );

  return (
    <>
      <PresentationDeckProvider value={deckContext}>
        <SlideDeck slide={sync.effectiveSlide} onNavigate={sync.onNavigate} />
      </PresentationDeckProvider>
      <PresentationControls sync={sync} />
    </>
  );
}
