import { SlidePoll } from "../_components/SlidePoll";

const OPTIONS = [
  { id: "instantly", label: "Instantly — better is better" },
  { id: "tempted", label: "Tempted, but I'd lose too much" },
  { id: "no", label: "No — too much of me is in here" },
  { id: "not-claude", label: "I don't use Claude" },
] as const;

export function SlidePollSwitch() {
  return (
    <SlidePoll
      pollId="audience-switch-v2"
      kicker="Quick poll"
      question="You've used Claude every day for 5 years. ChatGPT 10 launches — clearly better. Do you switch?"
      options={[...OPTIONS]}
    />
  );
}
