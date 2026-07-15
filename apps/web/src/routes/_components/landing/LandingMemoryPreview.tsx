import { useState } from "react";
import { cn } from "@vmem/ui";
import {
  edgeTouchesNode,
  previewEdges,
  previewNodes,
  type PreviewEdge,
  type PreviewNode,
  type PreviewNodeId,
} from "./landing-preview-data";

const defaultSnippet =
  "Select a node to see what recall surfaces — connected context, not keywords.";

function toggleNode(
  current: PreviewNodeId | null,
  next: PreviewNodeId,
): PreviewNodeId | null {
  return current === next ? null : next;
}

interface PreviewGraphEdgeProps {
  edge: PreviewEdge;
  activeNodeId: PreviewNodeId | null;
}

function PreviewGraphEdge({ edge, activeNodeId }: PreviewGraphEdgeProps) {
  const isActive = edgeTouchesNode(edge, activeNodeId);
  const isDimmed = activeNodeId !== null && !isActive;

  return (
    <path
      d={edge.d}
      stroke="currentColor"
      strokeWidth={edge.isRecall && isActive ? 1.35 : 1}
      strokeDasharray={edge.isRecall ? "3 5" : undefined}
      className={edge.isRecall ? "landing-graph-dash" : undefined}
      opacity={isDimmed ? 0.12 : isActive && edge.isRecall ? 0.75 : 0.32}
    />
  );
}

interface PreviewGraphNodeProps {
  node: PreviewNode;
  activeNodeId: PreviewNodeId | null;
  onHover: (nodeId: PreviewNodeId) => void;
  onToggle: (nodeId: PreviewNodeId) => void;
}

function PreviewGraphNode({
  node,
  activeNodeId,
  onHover,
  onToggle,
}: PreviewGraphNodeProps) {
  const isActive = activeNodeId === node.id;
  const isDimmed = activeNodeId !== null && !isActive;
  const hitRadius = node.r + 12;

  const nodeRadius = isActive ? node.r * (node.isCenter ? 1.12 : 1.18) : node.r;

  const nodeClassName = cn(
    "transition-[opacity]",
    node.isCenter && activeNodeId === null ? "landing-preview-pulse" : "",
    isActive ? "opacity-100" : "opacity-55",
  );

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
        fill="currentColor"
        className={nodeClassName}
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
}

function PreviewRecallIndicator() {
  return (
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
  );
}

function PreviewSnippetText({
  activeNodeId,
  snippet,
}: {
  activeNodeId: PreviewNodeId | null;
  snippet: string;
}) {
  if (activeNodeId === null) {
    return (
      <p className="mt-3 min-h-[3rem] text-pretty text-[11px] leading-relaxed text-muted transition-[color] sm:min-h-[2.5rem] sm:text-xs">
        {snippet}
      </p>
    );
  }

  return (
    <p className="mt-3 min-h-[3rem] text-pretty text-[11px] leading-relaxed text-foreground transition-[color] sm:min-h-[2.5rem] sm:text-xs">
      {snippet}
    </p>
  );
}

export function LandingMemoryPreview() {
  const [activeNodeId, setActiveNodeId] = useState<PreviewNodeId | null>(null);

  const activeNode = previewNodes.find((node) => node.id === activeNodeId);
  const snippet = activeNode?.snippet ?? defaultSnippet;
  const matchLabel = activeNodeId === null ? "…" : "1 match";

  const handleNodeHover = (nodeId: PreviewNodeId) => {
    setActiveNodeId(nodeId);
  };

  const handleNodeToggle = (nodeId: PreviewNodeId) => {
    setActiveNodeId((current) => toggleNode(current, nodeId));
  };

  return (
    <div
      className="relative touch-manipulation overflow-hidden rounded-3xl bg-surface px-3.5 pb-4 pt-3 sm:px-5 sm:pb-5"
      onMouseLeave={() => setActiveNodeId(null)}
    >
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted sm:tracking-[0.2em]">
          Memory graph
        </p>
        <p className="font-instrumentSerif text-sm tabular-nums text-muted/80">
          128 nodes
        </p>
      </div>

      <div className="mb-3 overflow-x-auto rounded-2xl bg-surface-secondary px-3 py-2 font-mono text-[10px] leading-relaxed text-muted">
        <span className="whitespace-nowrap">
          <span className="text-foreground/75">mcp</span>{" "}
          <span className="text-foreground">memory.retrieve</span>
          <span className="text-muted"> → {matchLabel}</span>
        </span>
      </div>

      <svg
        viewBox="0 0 320 188"
        className="w-full select-none text-foreground/90"
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
          d="M160 94 L248 58"
          stroke="none"
          fill="none"
        />

        {previewNodes.map((node) => (
          <PreviewGraphNode
            key={node.id}
            node={node}
            activeNodeId={activeNodeId}
            onHover={handleNodeHover}
            onToggle={handleNodeToggle}
          />
        ))}
      </svg>

      <PreviewSnippetText activeNodeId={activeNodeId} snippet={snippet} />
    </div>
  );
}
