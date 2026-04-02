"use client";

import { useEffect, useCallback, useState } from "react";
import { useRegisterEvents, useSigma } from "@react-sigma/core";
import type { SigmaNodeEventPayload, MouseCoords } from "sigma/types";

export default function NodeDragHandler() {
  const sigma = useSigma();
  const registerEvents = useRegisterEvents();
  const [draggedNode, setDraggedNode] = useState<string | null>(null);

  const handleDownNode = useCallback(
    (payload: SigmaNodeEventPayload) => {
      if (
        payload.event.original instanceof MouseEvent &&
        payload.event.original.shiftKey
      )
        return;
      setDraggedNode(payload.node);
      sigma.getGraph().setNodeAttribute(payload.node, "highlighted", true);
    },
    [sigma],
  );

  const handleMouseMove = useCallback(
    (coords: MouseCoords) => {
      if (!draggedNode) return;
      const pos = sigma.viewportToGraph(coords);
      sigma.getGraph().setNodeAttribute(draggedNode, "x", pos.x);
      sigma.getGraph().setNodeAttribute(draggedNode, "y", pos.y);
      coords.preventSigmaDefault();
      coords.original.preventDefault();
    },
    [draggedNode, sigma],
  );

  const handleMouseUp = useCallback(() => {
    if (draggedNode) {
      sigma.getGraph().removeNodeAttribute(draggedNode, "highlighted");
      setDraggedNode(null);
    }
  }, [draggedNode, sigma]);

  const handleMouseDown = useCallback(() => {
    if (!sigma.getCustomBBox()) {
      sigma.setCustomBBox(sigma.getBBox());
    }
  }, [sigma]);

  useEffect(() => {
    registerEvents({
      downNode: handleDownNode,
      mousemovebody: handleMouseMove,
      mouseup: handleMouseUp,
      mousedown: handleMouseDown,
    });
  }, [
    registerEvents,
    handleDownNode,
    handleMouseMove,
    handleMouseUp,
    handleMouseDown,
  ]);

  return null;
}
