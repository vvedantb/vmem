import { diffWords } from "diff";
import type { Change } from "diff";
import { cn } from "@vmem/ui";

interface DiffDisplayProps {
  oldText: string;
  newText: string;
  className?: string;
}

export default function DiffDisplay({
  oldText,
  newText,
  className,
}: DiffDisplayProps) {
  const changes: Change[] = diffWords(oldText, newText);

  return (
    <div
      className={cn(
        "overflow-wrap-anywhere text-sm leading-relaxed whitespace-pre-wrap text-foreground/80",
        className,
      )}
    >
      {changes.map((part, index) => {
        if (part.added) {
          return (
            <span
              key={index}
              className="rounded-sm bg-success/15 px-0.5 text-success"
            >
              {part.value}
            </span>
          );
        }
        if (part.removed) {
          return (
            <span
              key={index}
              className="rounded-sm bg-danger/15 px-0.5 text-danger line-through"
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
