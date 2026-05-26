import { diffWords } from "diff";
import type { Change } from "diff";

interface DiffDisplayProps {
  oldText: string;
  newText: string;
}

export default function DiffDisplay({ oldText, newText }: DiffDisplayProps) {
  const changes: Change[] = diffWords(oldText, newText);

  return (
    <div className="rounded-lg bg-surface-secondary/30 p-3 font-mono text-sm leading-relaxed whitespace-pre-wrap">
      {changes.map((part, index) => {
        if (part.added) {
          return (
            <span
              key={index}
              className="bg-green-100 dark:bg-green-900/30 rounded-sm px-0.5"
            >
              {part.value}
            </span>
          );
        }
        if (part.removed) {
          return (
            <span
              key={index}
              className="bg-red-100 dark:bg-red-900/30 line-through rounded-sm px-0.5"
            >
              {part.value}
            </span>
          );
        }
        return <span key={index}>{part.value}</span>;
      })}
    </div>
  );
}
