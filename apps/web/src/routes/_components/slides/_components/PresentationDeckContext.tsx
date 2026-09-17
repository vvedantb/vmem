import { createContext, useContext } from "react";

/**
 * Live-session context surfaced to slide components (e.g. poll slides), which
 * `SlideDeck` renders with no props. Lets a slide know whether the deck is
 * being shared, who this browser is for voting, and (presenter only) the host
 * token. Provided by the `/slides` route from `usePresentationSync`.
 */
export interface PresentationDeck {
  /** Active share code, or undefined when not sharing (solo deck). */
  sessionCode: string | undefined;
  /** Stable per-browser id — dedupes poll votes (one per participant). */
  participantKey: string;
  /** Secret host token when this browser is the presenter, else null. */
  hostKey: string | null;
}

const PresentationDeckContext = createContext<PresentationDeck>({
  sessionCode: undefined,
  participantKey: "",
  hostKey: null,
});

export const PresentationDeckProvider = PresentationDeckContext.Provider;

export function usePresentationDeck(): PresentationDeck {
  return useContext(PresentationDeckContext);
}
