import { SlidePoll } from "../_components/SlidePoll";

const OPTIONS = [
  { id: "history", label: "Chat history and threads" },
  { id: "memory", label: "Memory & context I've built up" },
  { id: "skills", label: "Skills" },
  { id: "artifacts", label: "Artifacts" },
  { id: "nothing", label: "Nothing — I'd switch" },
] as const;

export function SlidePollStickiness() {
  return (
    <SlidePoll
      pollId="audience-stickiness-v2"
      kicker="Quick poll"
      question="What would hold you back from leaving Claude for a better model?"
      options={[...OPTIONS]}
      multiSelect
    />
  );
}
