/** Decorative graph atmosphere — presentational only, no interaction. */
export function LandingAmbientGraph() {
  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      aria-hidden
    >
      <div
        className="absolute inset-0 opacity-[0.45] dark:opacity-30"
        style={{
          backgroundImage:
            "radial-gradient(circle, color-mix(in oklch, var(--foreground) 7%, transparent) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      />
      <div className="absolute -right-[20%] top-[8%] h-[min(70vh,520px)] w-[min(70vw,520px)] rounded-full bg-surface-secondary/70 blur-3xl dark:bg-surface-secondary/40" />
      <div className="absolute -left-[10%] bottom-[5%] h-64 w-64 rounded-full bg-surface-tertiary/50 blur-3xl dark:bg-surface-tertiary/25" />
      <svg
        className="absolute inset-0 h-full w-full text-foreground/10 dark:text-foreground/[0.07]"
        viewBox="0 0 800 600"
        preserveAspectRatio="xMidYMid slice"
        fill="none"
      >
        <path
          d="M120 380 C 220 280, 320 420, 420 300 S 620 180, 700 260"
          stroke="currentColor"
          strokeWidth="1"
        />
        <path
          d="M180 140 C 280 200, 360 120, 480 200 S 640 320, 720 240"
          stroke="currentColor"
          strokeWidth="1"
        />
        <circle cx="120" cy="380" r="5" fill="currentColor" />
        <circle cx="420" cy="300" r="7" fill="currentColor" />
        <circle cx="700" cy="260" r="4" fill="currentColor" />
        <circle cx="180" cy="140" r="4" fill="currentColor" />
        <circle cx="480" cy="200" r="6" fill="currentColor" />
        <circle cx="720" cy="240" r="5" fill="currentColor" />
      </svg>
    </div>
  );
}
