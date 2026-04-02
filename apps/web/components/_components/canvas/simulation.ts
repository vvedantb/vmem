import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  type Simulation,
} from "d3-force";
import type { GraphNode, GraphEdge } from "./types";

export interface SimulationController {
  simulation: Simulation<GraphNode, GraphEdge>;
  tick: () => void;
  reheat: () => void;
  setStrength: (scalingRatio: number) => void;
  setGravity: (gravity: number) => void;
  updateData: (nodes: GraphNode[], edges: GraphEdge[]) => void;
  stop: () => void;
}

export function createSimulation(
  nodes: GraphNode[],
  edges: GraphEdge[],
  scalingRatio: number,
  gravity: number,
): SimulationController {
  const chargeStrength = -scalingRatio * 150;

  const linkForce = forceLink<GraphNode, GraphEdge>(edges)
    .id((d) => d.id)
    .distance(200)
    .strength((d) => (d.edgeType === "relates_to" ? 0.3 : 0.05));

  const chargeForce = forceManyBody<GraphNode>().strength(chargeStrength);

  const centerForce = forceCenter<GraphNode>(0, 0).strength(gravity * 0.1);

  const collideForce = forceCollide<GraphNode>()
    .radius((d) => d.size * 3 + 5)
    .strength(0.7);

  const simulation = forceSimulation<GraphNode, GraphEdge>(nodes)
    .force("link", linkForce)
    .force("charge", chargeForce)
    .force("center", centerForce)
    .force("collide", collideForce)
    .alphaDecay(0.02)
    .velocityDecay(0.3);

  for (let i = 0; i < 100; i++) {
    simulation.tick();
  }

  simulation.alpha(0.3).restart();

  return {
    simulation,

    tick() {
      simulation.tick();
    },

    reheat() {
      simulation.alpha(0.5).restart();
    },

    setStrength(scalingRatio: number) {
      chargeForce.strength(-scalingRatio * 150);
      simulation.alpha(0.3).restart();
    },

    setGravity(gravity: number) {
      centerForce.strength(gravity * 0.1);
      simulation.alpha(0.3).restart();
    },

    updateData(newNodes: GraphNode[], newEdges: GraphEdge[]) {
      simulation.nodes(newNodes);
      linkForce.links(newEdges);
      simulation.alpha(0.5).restart();
    },

    stop() {
      simulation.stop();
    },
  };
}
