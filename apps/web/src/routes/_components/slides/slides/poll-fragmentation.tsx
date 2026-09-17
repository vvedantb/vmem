import { SlidePoll } from "../_components/SlidePoll";

const OPTIONS = [
  { id: "one", label: "Just one" },
  { id: "few", label: "Two or three" },
  { id: "several", label: "Four to six" },
  { id: "lost", label: "Honestly, lost count" },
] as const;

export function SlidePollFragmentation() {
  return (
    <SlidePoll
      pollId="audience-fragmentation"
      kicker="Quick poll"
      question="How many AI tools have learned something about how you work?"
      options={[...OPTIONS]}
    />
  );
}
