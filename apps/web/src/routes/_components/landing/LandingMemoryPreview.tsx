/** Decorative mini graph — illustrates the product, not live data. */
export function LandingMemoryPreview() {
  return (
    <div className="relative overflow-hidden rounded-3xl bg-surface px-4 pb-4 pt-3.5 sm:px-5 sm:pb-5">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted">
          Memory graph
        </p>
        <p className="font-instrumentSerif text-sm tabular-nums text-muted/80">
          128 nodes
        </p>
      </div>

      <svg
        viewBox="0 0 320 188"
        className="w-full text-foreground/90"
        aria-hidden
        fill="none"
      >
        <path
          d="M88 52 L160 94 L248 58"
          stroke="currentColor"
          strokeWidth="1"
          opacity="0.35"
        />
        <path
          d="M56 132 L160 94 L264 128"
          stroke="currentColor"
          strokeWidth="1"
          opacity="0.35"
        />
        <path
          d="M160 94 L160 154"
          stroke="currentColor"
          strokeWidth="1"
          opacity="0.45"
        />
        <path
          d="M88 52 L56 132"
          stroke="currentColor"
          strokeWidth="1"
          opacity="0.28"
        />
        <path
          d="M248 58 L264 128"
          stroke="currentColor"
          strokeWidth="1"
          opacity="0.28"
        />

        <path
          id="landing-recall-path"
          d="M160 94 L248 58"
          stroke="currentColor"
          strokeWidth="1.25"
          strokeDasharray="3 5"
          className="landing-graph-dash text-foreground"
          opacity="0.55"
        />

        <circle r="3" fill="currentColor" className="text-foreground">
          <animateMotion
            dur="3.2s"
            repeatCount="indefinite"
            keyPoints="0;1"
            keyTimes="0;1"
            calcMode="linear"
          >
            <mpath href="#landing-recall-path" />
          </animateMotion>
        </circle>

        <g opacity="0.9">
          <circle cx="88" cy="52" r="7" fill="currentColor" opacity="0.55" />
          <text
            x="88"
            y="36"
            textAnchor="middle"
            className="fill-muted text-[9px] font-medium"
            style={{ fontFamily: "Instrument Sans, system-ui, sans-serif" }}
          >
            profile
          </text>
        </g>

        <g>
          <circle
            cx="160"
            cy="94"
            r="11"
            fill="currentColor"
            className="landing-preview-pulse"
          />
          <text
            x="160"
            y="118"
            textAnchor="middle"
            className="fill-foreground text-[9px] font-medium"
            style={{ fontFamily: "Instrument Sans, system-ui, sans-serif" }}
          >
            episodic
          </text>
        </g>

        <g opacity="0.9">
          <circle cx="248" cy="58" r="8" fill="currentColor" opacity="0.7" />
          <text
            x="248"
            y="42"
            textAnchor="middle"
            className="fill-muted text-[9px] font-medium"
            style={{ fontFamily: "Instrument Sans, system-ui, sans-serif" }}
          >
            knowledge
          </text>
        </g>

        <g opacity="0.85">
          <circle cx="56" cy="132" r="6" fill="currentColor" opacity="0.45" />
          <text
            x="56"
            y="152"
            textAnchor="middle"
            className="fill-muted text-[9px] font-medium"
            style={{ fontFamily: "Instrument Sans, system-ui, sans-serif" }}
          >
            tool output
          </text>
        </g>

        <g opacity="0.85">
          <circle cx="264" cy="128" r="6" fill="currentColor" opacity="0.5" />
          <text
            x="264"
            y="148"
            textAnchor="middle"
            className="fill-muted text-[9px] font-medium"
            style={{ fontFamily: "Instrument Sans, system-ui, sans-serif" }}
          >
            entity
          </text>
        </g>

        <circle cx="160" cy="154" r="5" fill="currentColor" opacity="0.4" />
      </svg>

      <p className="mt-3 text-pretty text-[11px] leading-relaxed text-muted">
        Recall pulls the right slice of context — connected, not
        keyword-matched.
      </p>
    </div>
  );
}
