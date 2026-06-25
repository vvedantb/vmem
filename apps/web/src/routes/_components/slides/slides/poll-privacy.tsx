import { SlidePoll } from "../_components/SlidePoll";

const OPTIONS = [
  { id: "fine", label: "Fine — I do it already" },
  { id: "nonsensitive", label: "Only the non-sensitive stuff" },
  { id: "no", label: "No — that's a hard line" },
] as const;

export function SlidePollPrivacy() {
  return (
    <SlidePoll
      pollId="audience-privacy"
      kicker="Quick poll"
      question="Outside of work, how comfortable are you putting sensitive personal data into models?"
      options={[...OPTIONS]}
    />
  );
}
