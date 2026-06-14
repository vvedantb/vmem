import { BlurWordsTitle } from "../_components/BlurWordsTitle";
import { SlideShell } from "../_components/SlideShell";

/**
 * The tool-churn punchline: each line blur-reveals in sequence, dimmer for
 * the past, full strength for the unknown future. Pure text, dark theme.
 */
const LINES = [
  { text: "Last year it was Perplexity.", dim: "opacity-35", delay: 0 },
  { text: "Yesterday it was ChatGPT.", dim: "opacity-55", delay: 1.1 },
  { text: "Today it is Claude.", dim: "opacity-75", delay: 2.2 },
  { text: "Tomorrow it will be ???", dim: "opacity-100", delay: 3.5 },
] as const;

export function Slide16Tomorrow() {
  return (
    <SlideShell center>
      <div className="flex flex-col items-center gap-6">
        {LINES.map(({ text, dim, delay }) => (
          <div key={text} className={dim}>
            <BlurWordsTitle lines={[text]} size="2xl" delay={delay} />
          </div>
        ))}
      </div>
    </SlideShell>
  );
}
