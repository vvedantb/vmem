"use client";

import { useState } from "react";
import { cn } from "@vmem/ui";
import {
  edgeTouchesNode,
  previewEdges,
  previewNodes,
  type PreviewNodeId,
} from "./landing-preview-data";

const defaultSnippet =
  "Hover a node to see what recall surfaces — connected context, not keywords.";

export function LandingMemoryPreview() {
  const [activeNodeId, setActiveNodeId] = useState<PreviewNodeId | null>(null);

  const activeNode = previewNodes.find((node) => node.id === activeNodeId);
  const snippet = activeNode?.snippet ?? defaultSnippet;

  return (
    <div
      className="relative overflow-hidden rounded-3xl bg-surface px-4 pb-4 pt-3.5 sm:px-5 sm:pb-5"
      onMouseLeave={() => setActiveNodeId(null)}
    >
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted">
          Memory graph
        </p>
        <p className="font-instrumentSerif text-sm tabular-nums text-muted/80">
          128 nodes
        </p>
      </div>

      <div className="mb-3 rounded-2xl bg-surface-secondary px-3 py-2 font-mono text-[10px] leading-relaxed text-muted">
        <span className="text-foreground/75">mcp</span>{" "}
        <span className="text-foreground">memory.retrieve</span>
        <span className="text-muted"> → {activeNodeId ? "1 match" : "…"}</span>
      </div>

      <svg
        viewBox="0 0 320 188"
        className="w-full touch-none select-none text-foreground/90"
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
              <mpath href="#landing-recall-path" />
            </animateMotion>
          </circle>
        ) : null}

        <path
          id="landing-recall-path"
          d="M160 94 L248 58"
          stroke="none"
          fill="none"
        />

        {previewNodes.map((node) => {
          const isActive = activeNodeId === node.id;
          const isDimmed = activeNodeId !== null && !isActive;

          return (
            <g
              key={node.id}
              className="cursor-pointer"
              opacity={isDimmed ? 0.35 : 1}
              onMouseEnter={() => setActiveNodeId(node.id)}
              onFocus={() => setActiveNodeId(node.id)}
              onBlur={() => setActiveNodeId(null)}
              tabIndex={0}
              role="button"
              aria-label={`${node.label} memory node`}
            >
              <circle
                cx={node.cx}
                cy={node.cy}
                r={node.r + 6}
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
                  "text-[9px] font-medium transition-[fill]",
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
          "mt-3 min-h-[2.5rem] text-pretty text-[11px] leading-relaxed transition-[color]",
          activeNodeId ? "text-foreground" : "text-muted",
        )}
      >
        {snippet}
      </p>
    </div>
  );
}
