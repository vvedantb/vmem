import { useState } from "react";
import { useTheme } from "next-themes";
import { cn } from "@vmem/ui";
import { hslToHex, tagToColor } from "@vmem/shared/graph";
import {
  edgeTouchesNode,
  previewEdges,
  previewNodes,
  type PreviewEdge,
  type PreviewNode,
  type PreviewNodeId,
} from "./landing-preview-data";

const defaultSnippet =
  "Select a node to see what recall surfaces — connected context, not a keyword dump.";

function nodeFill(node: PreviewNode, isDark: boolean): string {
  if (node.kind === "entity") {
    return isDark ? hslToHex(45, 70, 65) : hslToHex(45, 75, 45);
  }
  if (node.kind === "skill") {
    return isDark ? hslToHex(285, 55, 72) : hslToHex(285, 60, 50);
  }
  if (node.kind === "wiki-document") {
    return isDark ? hslToHex(35, 55, 70) : hslToHex(35, 60, 50);
  }
  const tag = node.tags[0];
  if (tag !== undefined) return tagToColor(tag, isDark);
  return isDark ? "#888888" : "#999999";
}

function toggleNode(
  current: PreviewNodeId | null,
  next: PreviewNodeId,
): PreviewNodeId | null {
  return current === next ? null : next;
}

export function LandingMemoryPreview() {
  const [activeNodeId, setActiveNodeId] = useState<PreviewNodeId | null>(null);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const activeNode = previewNodes.find((node) => node.id === activeNodeId);
  const snippet = activeNode?.snippet ?? defaultSnippet;
  const matchLabel = activeNodeId === null ? "…" : "1 match";

  return (
    <div
      className="flex h-full flex-col px-3 pb-4 md:px-4"
      onMouseLeave={() => setActiveNodeId(null)}
    >
      <div className="mb-3 overflow-x-auto rounded-lg bg-surface-secondary px-3 py-2 font-mono text-[10px] leading-relaxed text-muted scrollbar-thin">
        <span className="whitespace-nowrap">
          <span className="text-foreground/75">mcp</span>{" "}
          <span className="text-foreground">memory.retrieve</span>
          <span className="text-muted"> → {matchLabel}</span>
        </span>
      </div>

      <svg
        viewBox="0 0 640 360"
        className="min-h-0 w-full flex-1 select-none"
        aria-label="Interactive memory graph preview"
        fill="none"
      >
        {previewEdges.map((edge) => (
          <PreviewGraphEdge
            key={`${edge.from}-${edge.to}`}
            edge={edge}
            activeNodeId={activeNodeId}
          />
        ))}

        {activeNodeId === null ? <PreviewRecallIndicator /> : null}

        <path
          id="landing-recall-path"
          d="M320 176 L508 108"
          stroke="none"
          fill="none"
        />

        {previewNodes.map((node) => (
          <PreviewGraphNode
            key={node.id}
            node={node}
            fill={nodeFill(node, isDark)}
            activeNodeId={activeNodeId}
            onHover={setActiveNodeId}
            onToggle={(nodeId) =>
              setActiveNodeId((current) => toggleNode(current, nodeId))
            }
          />
        ))}
      </svg>

      <p
        className={cn(
          "mt-1 min-h-[2.75rem] text-pretty text-[11px] leading-relaxed transition-[color] duration-200 sm:text-xs",
          activeNodeId === null ? "text-muted" : "text-foreground",
        )}
      >
        {snippet}
      </p>
    </div>
  );
}

function PreviewGraphEdge({
  edge,
  activeNodeId,
}: {
  edge: PreviewEdge;
  activeNodeId: PreviewNodeId | null;
}) {
  const isActive = edgeTouchesNode(edge, activeNodeId);
  const isDimmed = activeNodeId !== null && !isActive;

  return (
    <path
      d={edge.d}
      stroke="currentColor"
      strokeWidth={edge.isRecall && isActive ? 1.6 : 1}
      strokeDasharray={edge.isRecall ? "3 5" : undefined}
      className={cn(
        "text-foreground/80",
        edge.isRecall ? "landing-graph-dash" : undefined,
      )}
      opacity={isDimmed ? 0.12 : isActive && edge.isRecall ? 0.75 : 0.28}
    />
  );
}

function PreviewGraphNode({
  node,
  fill,
  activeNodeId,
  onHover,
  onToggle,
}: {
  node: PreviewNode;
  fill: string;
  activeNodeId: PreviewNodeId | null;
  onHover: (nodeId: PreviewNodeId) => void;
  onToggle: (nodeId: PreviewNodeId) => void;
}) {
  const isActive = activeNodeId === node.id;
  const isDimmed = activeNodeId !== null && !isActive;
  const hitRadius = node.r + 14;
  const nodeRadius = isActive ? node.r * (node.isCenter ? 1.12 : 1.18) : node.r;

  return (
    <g
      className="cursor-pointer"
      opacity={isDimmed ? 0.35 : 1}
      onPointerEnter={() => onHover(node.id)}
      onPointerDown={(event) => {
        event.preventDefault();
        onToggle(node.id);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onToggle(node.id);
        }
      }}
      tabIndex={0}
      role="button"
      aria-pressed={isActive}
      aria-label={`${node.label} memory node`}
    >
      <circle cx={node.cx} cy={node.cy} r={hitRadius} fill="transparent" />
      <circle
        cx={node.cx}
        cy={node.cy}
        r={nodeRadius}
        fill={fill}
        className={cn(
          "transition-[opacity]",
          node.isCenter && activeNodeId === null ? "landing-preview-pulse" : "",
        )}
      />
      <text
        x={node.cx}
        y={node.labelY}
        textAnchor="middle"
        className={cn(
          "pointer-events-none text-[10px] font-medium",
          isActive ? "fill-foreground" : "fill-muted",
        )}
        style={{ fontFamily: "Instrument Sans, system-ui, sans-serif" }}
      >
        {node.label}
      </text>
    </g>
  );
}

function PreviewRecallIndicator() {
  return (
    <circle r="3.5" fill="currentColor" className="text-foreground">
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
  );
}
