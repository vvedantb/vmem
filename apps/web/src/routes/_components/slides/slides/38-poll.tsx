import { SlidePoll } from "../_components/SlidePoll";

/**
 * Example curated poll. Edit the question/options freely; to add another poll
 * slide, copy this with a NEW `pollId` (votes are scoped by pollId) and
 * register it in `slides/index.ts`.
 */
export function Slide38Poll() {
  return (
    <SlidePoll
      pollId="audience-fit"
      kicker="Quick poll"
      question="Where would a memory layer help you most?"
      options={[
        { id: "coding", label: "Coding agents that remember the codebase" },
        { id: "team", label: "Team knowledge that never walks out the door" },
        {
          id: "assistant",
          label: "A personal assistant that actually knows me",
        },
        { id: "support", label: "Customer support with the full history" },
      ]}
    />
  );
}
