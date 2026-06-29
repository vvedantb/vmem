import { SlidePoll } from "../_components/SlidePoll";

const OPTIONS = [
  { id: "chatgpt", label: "ChatGPT" },
  { id: "gemini", label: "Gemini" },
  { id: "composer", label: "Composer" },
  { id: "perplexity", label: "Perplexity" },
  { id: "grok", label: "Grok" },
  { id: "other", label: "Other" },
  { id: "none", label: "None — I only use Claude" },
] as const;

export function SlidePollModels() {
  return (
    <SlidePoll
      pollId="audience-models"
      kicker="Quick poll"
      question="Besides Claude, what other models do you use — work or personal?"
      options={[...OPTIONS]}
      multiSelect
    />
  );
}
