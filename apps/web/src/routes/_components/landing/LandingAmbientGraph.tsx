/** Decorative graph atmosphere — presentational only, no interaction. */
export function LandingAmbientGraph() {
  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      aria-hidden
    >
      <div
        className="absolute inset-0 opacity-[0.5] dark:opacity-[0.35]"
        style={{
          backgroundImage:
            "radial-gradient(circle, color-mix(in oklch, var(--foreground) 8%, transparent) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />

      <div className="absolute -right-[15%] top-[5%] h-[min(75vh,560px)] w-[min(75vw,560px)] rounded-full bg-surface-secondary/80 blur-3xl dark:bg-surface-secondary/35" />
      <div className="absolute -left-[8%] bottom-[10%] h-72 w-72 rounded-full bg-surface-tertiary/60 blur-3xl dark:bg-surface-tertiary/20" />

      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_40%,transparent_20%,var(--background)_100%)]" />

      <svg
        className="absolute inset-0 h-full w-full text-foreground/[0.12] dark:text-foreground/[0.08]"
        viewBox="0 0 900 700"
        preserveAspectRatio="xMidYMid slice"
        fill="none"
      >
        <path
          d="M140 420 C 260 300, 340 480, 460 340 S 660 200, 780 280"
          stroke="currentColor"
          strokeWidth="1"
          strokeDasharray="4 6"
          className="landing-graph-dash"
        />
        <path
          d="M200 160 C 300 220, 400 140, 520 220 S 680 360, 800 280"
          stroke="currentColor"
          strokeWidth="1"
        />
        <path
          d="M520 220 L 460 340 L 660 200"
          stroke="currentColor"
          strokeWidth="0.75"
          opacity="0.6"
        />
        <path
          d="M200 160 L 460 340"
          stroke="currentColor"
          strokeWidth="0.75"
          opacity="0.5"
        />

        <circle cx="140" cy="420" r="5" fill="currentColor">
          <animate
            attributeName="opacity"
            values="0.35;1;0.35"
            dur="5s"
            repeatCount="indefinite"
          />
        </circle>
        <circle cx="460" cy="340" r="8" fill="currentColor">
          <animate
            attributeName="opacity"
            values="0.5;1;0.5"
            dur="4s"
            repeatCount="indefinite"
          />
        </circle>
        <circle cx="780" cy="280" r="5" fill="currentColor">
          <animate
            attributeName="opacity"
            values="0.4;0.95;0.4"
            dur="6s"
            repeatCount="indefinite"
          />
        </circle>
        <circle cx="200" cy="160" r="4" fill="currentColor">
          <animate
            attributeName="opacity"
            values="0.3;0.9;0.3"
            dur="5.5s"
            repeatCount="indefinite"
          />
        </circle>
        <circle cx="520" cy="220" r="6" fill="currentColor">
          <animate
            attributeName="opacity"
            values="0.45;1;0.45"
            dur="4.5s"
            repeatCount="indefinite"
          />
        </circle>
        <circle cx="660" cy="200" r="4" fill="currentColor">
          <animate
            attributeName="opacity"
            values="0.35;0.85;0.35"
            dur="5.2s"
            repeatCount="indefinite"
          />
        </circle>
        <circle cx="800" cy="280" r="5" fill="currentColor">
          <animate
            attributeName="opacity"
            values="0.4;1;0.4"
            dur="4.8s"
            repeatCount="indefinite"
          />
        </circle>
      </svg>

      <style>{`
        @keyframes landing-graph-dash {
          to { stroke-dashoffset: -20; }
        }
        .landing-graph-dash {
          animation: landing-graph-dash 12s linear infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .landing-graph-dash { animation: none; }
        }
      `}</style>
    </div>
  );
}
