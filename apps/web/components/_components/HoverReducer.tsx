"use client";

import { useEffect } from "react";
import { useSetSettings, useSigma } from "@react-sigma/core";
import type { GraphViewTheme } from "./graph-view-themes";

interface HoverReducerProps {
  hoveredNode: string | null;
  viewTheme: GraphViewTheme;
}

export default function HoverReducer({
  hoveredNode,
  viewTheme,
}: HoverReducerProps) {
  const sigma = useSigma();
  const setSettings = useSetSettings();

  useEffect(() => {
    const graph = sigma.getGraph();

    if (!hoveredNode) {
      setSettings({
        nodeReducer: undefined,
        edgeReducer: undefined,
      });
      return;
    }

    const neighbors = new Set(graph.neighbors(hoveredNode));
    neighbors.add(hoveredNode);

    setSettings({
      nodeReducer: (node, data) => {
        if (neighbors.has(node)) {
          return {
            ...data,
            forceLabel: true,
            zIndex: 1,
          };
        }
        return {
          ...data,
          label: "",
          color: viewTheme.isDarkCanvas ? "#222233" : "#E2E2E2",
          zIndex: 0,
        };
      },
      edgeReducer: (edge, data) => {
        const extremities = graph.extremities(edge);
        if (
          extremities.includes(hoveredNode) &&
          neighbors.has(extremities[0]) &&
          neighbors.has(extremities[1])
        ) {
          return {
            ...data,
            color: viewTheme.edge.connected,
            size: viewTheme.edge.connectedWidth,
          };
        }
        return { ...data, hidden: true };
      },
    });
  }, [hoveredNode, sigma, setSettings, viewTheme]);

  return null;
}
