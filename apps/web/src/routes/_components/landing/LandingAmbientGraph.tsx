import "./landing.css";

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

      <div className="landing-grain absolute inset-0 opacity-[0.035] mix-blend-multiply dark:opacity-[0.05] dark:mix-blend-soft-light" />

      <div className="absolute -right-[12%] top-[2%] h-[min(78vh,580px)] w-[min(78vw,580px)] rounded-full bg-surface-secondary/85 blur-3xl dark:bg-surface-secondary/30" />
      <div className="absolute -left-[6%] bottom-[8%] h-80 w-80 rounded-full bg-surface-tertiary/55 blur-3xl dark:bg-surface-tertiary/18" />

      <div className="absolute inset-0 bg-[radial-gradient(ellipse_75%_55%_at_42%_38%,transparent_15%,var(--background)_92%)]" />

      <svg
        className="landing-ambient-drift absolute inset-0 h-full w-full text-foreground/[0.11] dark:text-foreground/[0.07]"
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
        <path
          d="M620 120 L 720 200 L 660 320"
          stroke="currentColor"
          strokeWidth="0.65"
          opacity="0.35"
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
        <circle cx="720" cy="200" r="3.5" fill="currentColor" opacity="0.5">
          <animate
            attributeName="opacity"
            values="0.25;0.75;0.25"
            dur="5.8s"
            repeatCount="indefinite"
          />
        </circle>
      </svg>
    </div>
  );
}
