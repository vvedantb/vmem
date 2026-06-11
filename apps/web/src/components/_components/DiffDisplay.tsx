import { diffWords } from "diff";
import type { Change } from "diff";

interface DiffDisplayProps {
  oldText: string;
  newText: string;
}

export default function DiffDisplay({ oldText, newText }: DiffDisplayProps) {
  const changes: Change[] = diffWords(oldText, newText);

  return (
    <div className="overflow-hidden break-words font-mono text-sm leading-relaxed whitespace-pre-wrap text-foreground">
      {changes.map((part, index) => {
        if (part.added) {
          return (
            <span
              key={index}
              className="bg-success/15 text-success rounded-sm px-0.5"
            >
              {part.value}
            </span>
          );
        }
        if (part.removed) {
          return (
            <span
              key={index}
              className="bg-danger/15 text-danger line-through rounded-sm px-0.5"
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
