import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { useCallback } from "react";
import { SlideDeck } from "./_components/slides/SlideDeck";
import { usePresentationSync } from "./_components/slides/usePresentationSync";
import { PresentationControls } from "./_components/slides/_components/PresentationControls";
import { JoinNamePrompt } from "./_components/slides/_components/JoinNamePrompt";

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

  return (
    <>
      <SlideDeck slide={sync.effectiveSlide} onNavigate={sync.onNavigate} />
      <PresentationControls sync={sync} />
      {sync.needsName && (
        <JoinNamePrompt hostName={sync.hostName} onSubmit={sync.setName} />
      )}
    </>
  );
}
