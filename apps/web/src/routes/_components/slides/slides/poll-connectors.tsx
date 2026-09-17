import { SlidePoll } from "../_components/SlidePoll";

const OPTIONS = [
  { id: "none", label: "None" },
  { id: "one", label: "1" },
  { id: "two-three", label: "2–3" },
  { id: "four-plus", label: "4 or more" },
  { id: "not-using", label: "I don't use Claude Connectors" },
] as const;

export function SlidePollConnectors() {
  return (
    <SlidePoll
      pollId="audience-connectors"
      kicker="Quick poll"
      question="How many different Claude Connectors are you connected to?"
      options={[...OPTIONS]}
    />
  );
}
