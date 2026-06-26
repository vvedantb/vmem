/**
 * Shared poll definitions — single source of truth for the poll slides AND the
 * `PollCallback` chips that reference a poll's live results later in the deck.
 * Keep `pollId` stable: votes are scoped by (session code, pollId).
 */

export interface PollOption {
  id: string;
  label: string;
}

export interface PollDef {
  pollId: string;
  question: string;
  options: PollOption[];
  multiSelect?: boolean;
}

export const POLL_STICKINESS: PollDef = {
  pollId: "audience-stickiness-v2",
  question: "What would hold you back from leaving Claude for a better model?",
  options: [
    { id: "history", label: "Chat history and threads" },
    { id: "memory", label: "Memory & context I've built up" },
    { id: "skills", label: "Skills" },
    { id: "artifacts", label: "Artifacts" },
    { id: "nothing", label: "Nothing — I'd switch" },
  ],
  multiSelect: true,
};

export const POLL_PRIVACY: PollDef = {
  pollId: "audience-privacy",
  question:
    "Outside of work, how comfortable are you putting sensitive personal data into models?",
  options: [
    { id: "fine", label: "Fine — I do it already" },
    { id: "nonsensitive", label: "Only the non-sensitive stuff" },
    { id: "no", label: "No — that's a hard line" },
  ],
};
