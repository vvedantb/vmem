interface SparklineProps {
  data: number[];
  strokeClassName: string;
}

export function Sparkline({ data, strokeClassName }: SparklineProps) {
  if (!data.some((value) => value > 0)) {
    return (
      <div aria-hidden className="flex h-10 items-end gap-0.5 opacity-40">
        {data.map((_, index) => (
          <span
            key={index}
            className="flex-1 rounded-sm bg-separator/40"
            style={{ height: 4 }}
          />
        ))}
      </div>
    );
  }

  const first = data[0];
  if (first === undefined) {
    return (
      <div aria-hidden className="flex h-10 items-end gap-0.5 opacity-40" />
    );
  }

  const width = 200;
  const height = 40;
  const padding = 2;
  let min = first;
  let max = first;
  for (let index = 1; index < data.length; index++) {
    const value = data[index];
    if (value === undefined) continue;
    if (value < min) min = value;
    if (value > max) max = value;
  }
  const range = max - min || 1;
  const span = Math.max(data.length - 1, 1);

  const points = data.map((value, index) => {
    const x = padding + (index / span) * (width - padding * 2);
    const y =
      height - padding - ((value - min) / range) * (height - padding * 2);
    return `${x},${y}`;
  });

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-10 w-full"
      preserveAspectRatio="none"
      aria-hidden
    >
      <path
        d={`M${points.join(" L")}`}
        fill="none"
        stroke="currentColor"
        className={strokeClassName}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
