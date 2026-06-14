import "@/routes/_components/landing/landing.css";

/**
 * Full-bleed ambient graph for slides — adapted from LandingAmbientGraph but
 * WITHOUT the left-side directional mask (so lines show across the whole
 * stage, including behind text) and with stronger line/dot opacity so the
 * pattern reads on light slides. Pair with a frosted-glass text panel to keep
 * copy legible while the lines stay visible (blurred) underneath.
 */
interface SlideAmbientGraphProps {
  /** Extra classes on the root — e.g. a mask to fade lines near text. */
  className?: string;
}

export function SlideAmbientGraph({ className = "" }: SlideAmbientGraphProps) {
  return (
    <div
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
      aria-hidden
    >
      {/* Dotted grid */}
      <div
        className="absolute inset-0 opacity-[0.7] dark:opacity-[0.4]"
        style={{
          backgroundImage:
            "radial-gradient(circle, color-mix(in oklch, var(--foreground) 14%, transparent) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />

      <div className="landing-grain absolute inset-0 opacity-[0.04] mix-blend-multiply dark:opacity-[0.05] dark:mix-blend-soft-light" />

      {/* Soft edge vignette — keeps the centre clear of hard edges without
          erasing the lines the way the landing version's heavier fade does. */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_90%_75%_at_50%_45%,transparent_45%,var(--background)_100%)]" />

      <svg
        className="landing-ambient-drift absolute inset-0 h-full w-full text-foreground/[0.22] dark:text-foreground/[0.12]"
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

        {[
          { cx: 140, cy: 420, r: 5, vals: "0.35;1;0.35", dur: "5s" },
          { cx: 460, cy: 340, r: 8, vals: "0.5;1;0.5", dur: "4s" },
          { cx: 780, cy: 280, r: 5, vals: "0.4;0.95;0.4", dur: "6s" },
          { cx: 200, cy: 160, r: 4, vals: "0.3;0.9;0.3", dur: "5.5s" },
          { cx: 520, cy: 220, r: 6, vals: "0.45;1;0.45", dur: "4.5s" },
          { cx: 660, cy: 200, r: 4, vals: "0.35;0.85;0.35", dur: "5.2s" },
          { cx: 800, cy: 280, r: 5, vals: "0.4;1;0.4", dur: "4.8s" },
          { cx: 720, cy: 200, r: 3.5, vals: "0.25;0.75;0.25", dur: "5.8s" },
        ].map((n) => (
          <circle
            key={`${n.cx}-${n.cy}`}
            cx={n.cx}
            cy={n.cy}
            r={n.r}
            fill="currentColor"
          >
            <animate
              attributeName="opacity"
              values={n.vals}
              dur={n.dur}
              repeatCount="indefinite"
            />
          </circle>
        ))}
      </svg>
    </div>
  );
}
