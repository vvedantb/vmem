"use client";

import { useEffect, useState } from "react";
import { motion, useMotionValue, useTransform, animate } from "motion/react";
import { cn } from "@vmem/ui";
import "@/routes/_components/landing/landing.css";
import {
  edgeTouchesNode,
  previewEdges,
  previewNodes,
  type PreviewNodeId,
} from "@/routes/_components/landing/landing-preview-data";

const SNIPPET_TARGET = "memory.retrieve";
const NODE_COUNT_TARGET = 128;

function toggleNode(
  current: PreviewNodeId | null,
  next: PreviewNodeId,
): PreviewNodeId | null {
  return current === next ? null : next;
}

/**
 * Slide-local copy of LandingMemoryPreview with two additional effects:
 * - "128 nodes" counts up 0 → 128 over ~1 s on mount (motion counter roll).
 * - The snippet "mcp memory.retrieve" types itself out char-by-char at 30 ms/char.
 *
 * landing.css is imported here so the `landing-graph-dash` and
 * `landing-preview-pulse` keyframes work even when LandingPage is not mounted.
 */
export function SlideMemoryPreview() {
  const [activeNodeId, setActiveNodeId] = useState<PreviewNodeId | null>(null);

  // ── Counter roll: 0 → 128 (looping) ────────────────────────────────────────
  const countMV = useMotionValue(0);
  const displayCount = useTransform(countMV, (v) => String(Math.round(v)));

  useEffect(() => {
    const animate_counter = () => {
      const controls = animate(countMV, NODE_COUNT_TARGET, {
        duration: 1,
        ease: [0.16, 1, 0.3, 1],
        onComplete: () => {
          countMV.set(0);
          animate_counter();
        },
      });
      return controls;
    };
    const controls = animate_counter();
    return () => controls.stop();
  }, [countMV]);

  // ── Typewriter: types out "memory.retrieve" then resets and loops ──────────
  const charCountMV = useMotionValue(0);
  const typedText = useTransform(charCountMV, (v) =>
    SNIPPET_TARGET.slice(0, Math.round(v)),
  );
  // Duration of the typing animation in seconds
  const typingDuration = SNIPPET_TARGET.length * 0.03;

  useEffect(() => {
    const animate_typewriter = () => {
      const controls = animate(charCountMV, SNIPPET_TARGET.length, {
        duration: typingDuration,
        ease: "linear",
        onComplete: () => {
          charCountMV.set(0);
          animate_typewriter();
        },
      });
      return controls;
    };
    const controls = animate_typewriter();
    return () => controls.stop();
  }, [charCountMV, typingDuration]);

  const activeNode = previewNodes.find((node) => node.id === activeNodeId);
  const snippet =
    activeNode?.snippet ??
    "Select a node to see what recall surfaces — connected context, not keywords.";

  return (
    <div
      className="relative touch-manipulation overflow-hidden rounded-3xl bg-surface px-3.5 pb-4 pt-3 sm:px-5 sm:pb-5"
      onMouseLeave={() => setActiveNodeId(null)}
    >
      {/* Header: "Memory graph" label + animated node counter */}
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted sm:tracking-[0.2em]">
          Memory graph
        </p>
        <p className="font-instrumentSerif text-sm tabular-nums text-muted/80">
          <motion.span>{displayCount}</motion.span> nodes
        </p>
      </div>

      {/* Snippet line with typewriter for "memory.retrieve" */}
      <div className="mb-3 overflow-x-auto rounded-2xl bg-surface-secondary px-3 py-2 font-mono text-[10px] leading-relaxed text-muted">
        <span className="whitespace-nowrap">
          <span className="text-foreground/75">mcp</span>{" "}
          <span className="text-foreground">
            <motion.span>{typedText}</motion.span>
            {/* Blinking caret: blinks during typing then fades out */}
            <motion.span
              className="ml-px inline-block h-[0.75em] w-px bg-current align-middle"
              animate={{ opacity: [1, 0, 1, 0, 1, 0] }}
              transition={{
                duration: typingDuration,
                times: [0, 0.15, 0.35, 0.5, 0.7, 1],
                ease: "linear",
              }}
              aria-hidden
            />
          </span>
          <span className="text-muted">
            {" "}
            → {activeNodeId ? "1 match" : "…"}
          </span>
        </span>
      </div>

      <svg
        viewBox="0 0 320 188"
        className="w-full select-none text-foreground/90"
        aria-label="Interactive memory graph preview"
        fill="none"
      >
        {previewEdges.map((edge) => {
          const isActive = edgeTouchesNode(edge, activeNodeId);
          const isDimmed = activeNodeId !== null && !isActive;

          return (
            <path
              key={`${edge.from}-${edge.to}`}
              d={edge.d}
              stroke="currentColor"
              strokeWidth={edge.isRecall && isActive ? 1.35 : 1}
              strokeDasharray={edge.isRecall ? "3 5" : undefined}
              className={edge.isRecall ? "landing-graph-dash" : undefined}
              opacity={
                isDimmed ? 0.12 : isActive && edge.isRecall ? 0.75 : 0.32
              }
            />
          );
        })}

        {activeNodeId === null ? (
          <circle r="3" fill="currentColor" className="text-foreground">
            <animateMotion
              dur="3.2s"
              repeatCount="indefinite"
              keyPoints="0;1"
              keyTimes="0;1"
              calcMode="linear"
            >
              <mpath href="#slide-recall-path" />
            </animateMotion>
          </circle>
        ) : null}

        {/* Hidden path for the animateMotion above — different id from landing */}
        <path
          id="slide-recall-path"
          d="M160 94 L248 58"
          stroke="none"
          fill="none"
        />

        {previewNodes.map((node) => {
          const isActive = activeNodeId === node.id;
          const isDimmed = activeNodeId !== null && !isActive;
          const hitRadius = node.r + 12;

          return (
            <g
              key={node.id}
              className="cursor-pointer"
              opacity={isDimmed ? 0.35 : 1}
              onPointerEnter={() => setActiveNodeId(node.id)}
              onPointerDown={(event) => {
                event.preventDefault();
                setActiveNodeId((current) => toggleNode(current, node.id));
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setActiveNodeId((current) => toggleNode(current, node.id));
                }
              }}
              tabIndex={0}
              role="button"
              aria-pressed={isActive}
              aria-label={`${node.label} memory node`}
            >
              <circle
                cx={node.cx}
                cy={node.cy}
                r={hitRadius}
                fill="transparent"
              />
              <circle
                cx={node.cx}
                cy={node.cy}
                r={isActive ? node.r * (node.isCenter ? 1.12 : 1.18) : node.r}
                fill="currentColor"
                className={cn(
                  "transition-[opacity]",
                  node.isCenter && activeNodeId === null
                    ? "landing-preview-pulse"
                    : "",
                  isActive ? "opacity-100" : "opacity-55",
                )}
              />
              <text
                x={node.cx}
                y={node.labelY}
                textAnchor="middle"
                className={cn(
                  "pointer-events-none text-[9px] font-medium transition-[fill] sm:text-[10px]",
                  isActive ? "fill-foreground" : "fill-muted",
                )}
                style={{ fontFamily: "Instrument Sans, system-ui, sans-serif" }}
              >
                {node.label}
              </text>
            </g>
          );
        })}
      </svg>

      <p
        className={cn(
          "mt-3 min-h-[3rem] text-pretty text-[11px] leading-relaxed transition-[color] sm:min-h-[2.5rem] sm:text-xs",
          activeNodeId ? "text-foreground" : "text-muted",
        )}
      >
        {snippet}
      </p>
    </div>
  );
}
