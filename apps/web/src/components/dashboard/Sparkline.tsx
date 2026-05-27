interface SparklineProps {
  data: number[];
  strokeClassName: string;
}

function hasActivity(data: number[]): boolean {
  return data.some((value) => value > 0);
}

export function Sparkline({ data, strokeClassName }: SparklineProps) {
  if (!hasActivity(data)) {
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

  const width = 200;
  const height = 40;
  const padding = 2;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data.map((value, index) => {
    const x = padding + (index / (data.length - 1)) * (width - padding * 2);
    const y =
      height - padding - ((value - min) / range) * (height - padding * 2);
    return `${x},${y}`;
  });

  const linePath = `M${points.join(" L")}`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-10 w-full"
      preserveAspectRatio="none"
      aria-hidden
    >
      <path
        d={linePath}
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
