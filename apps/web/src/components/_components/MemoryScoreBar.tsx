/**
 * One signal row in the Context Trace breakdown. Values may exceed 1 on some
 * legs (e.g. fulltext); the bar clamps to [0, 1] but the label shows the raw
 * score so operators can see magnitude.
 */
export default function MemoryScoreBar({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className="flex items-center gap-2">
      <span className="w-[88px] shrink-0 text-[10px] text-muted">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-secondary">
        <div
          className="h-full rounded-full bg-foreground/70"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-9 shrink-0 text-right text-[10px] tabular-nums text-muted">
        {value.toFixed(2)}
      </span>
    </div>
  );
}
