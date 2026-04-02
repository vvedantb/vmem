"use client";

import { useEffect, useCallback } from "react";
import { useRegisterEvents, useSigma } from "@react-sigma/core";
import type { SigmaNodeEventPayload } from "sigma/types";
import type { HoveredNodeInfo } from "./graph-types";

interface GraphEventHandlerProps {
  onHoverNode: (info: HoveredNodeInfo | null) => void;
  onClickNode: (nodeId: string) => void;
  onHoveredNodeChange: (nodeId: string | null) => void;
}

export default function GraphEventHandler({
  onHoverNode,
  onClickNode,
  onHoveredNodeChange,
}: GraphEventHandlerProps) {
  const sigma = useSigma();
  const registerEvents = useRegisterEvents();

  const handleEnterNode = useCallback(
    (payload: SigmaNodeEventPayload) => {
      const graph = sigma.getGraph();
      const attrs = graph.getNodeAttributes(payload.node);
      const viewport = sigma.graphToViewport({
        x: attrs.x,
        y: attrs.y,
      });
      onHoveredNodeChange(payload.node);
      onHoverNode({
        id: payload.node,
        title: attrs.label,
        content: attrs.content,
        viewportX: viewport.x,
        viewportY: viewport.y,
      });
    },
    [sigma, onHoverNode, onHoveredNodeChange],
  );

  const handleLeaveNode = useCallback(() => {
    onHoveredNodeChange(null);
    onHoverNode(null);
  }, [onHoverNode, onHoveredNodeChange]);

  const handleClickNode = useCallback(
    (payload: SigmaNodeEventPayload) => {
      onClickNode(payload.node);
    },
    [onClickNode],
  );

  useEffect(() => {
    registerEvents({
      enterNode: handleEnterNode,
      leaveNode: handleLeaveNode,
      clickNode: handleClickNode,
    });
  }, [registerEvents, handleEnterNode, handleLeaveNode, handleClickNode]);

  return null;
}
