"use client";

import { useEffect, useRef, useCallback } from "react";
import { useRegisterEvents, useSigma } from "@react-sigma/core";
import type { SigmaNodeEventPayload, MouseCoords } from "sigma/types";

interface LinkDragHandlerProps {
  onLinkNodes: (sourceId: string, targetId: string) => void;
}

function findNodeAtViewport(
  sigma: ReturnType<typeof useSigma>,
  x: number,
  y: number,
  excludeNode: string | null,
): string | null {
  const graph = sigma.getGraph();
  let closest: string | null = null;
  let closestDist = Infinity;

  graph.forEachNode((nodeId, attrs) => {
    if (nodeId === excludeNode) return;
    const vp = sigma.graphToViewport({ x: attrs.x, y: attrs.y });
    const dx = vp.x - x;
    const dy = vp.y - y;
    const dist = dx * dx + dy * dy;
    const hitRadius = Math.max((attrs.size ?? 5) * 2, 10);
    if (dist < hitRadius * hitRadius && dist < closestDist) {
      closestDist = dist;
      closest = nodeId;
    }
  });

  return closest;
}

export default function LinkDragHandler({ onLinkNodes }: LinkDragHandlerProps) {
  const sigma = useSigma();
  const registerEvents = useRegisterEvents();
  const sourceRef = useRef<string | null>(null);
  const targetRef = useRef<string | null>(null);

  const clearCanvas = useCallback(() => {
    const canvases = sigma.getCanvases();
    const mouseCanvas = canvases.mouse;
    const ctx = mouseCanvas.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, mouseCanvas.width, mouseCanvas.height);
    }
  }, [sigma]);

  const handleDownNode = useCallback((payload: SigmaNodeEventPayload) => {
    if (!(payload.event.original instanceof MouseEvent)) return;
    if (!payload.event.original.shiftKey) return;
    sourceRef.current = payload.node;
    targetRef.current = null;
    payload.preventSigmaDefault();
  }, []);

  const handleMouseMove = useCallback(
    (coords: MouseCoords) => {
      if (!sourceRef.current) return;

      coords.preventSigmaDefault();

      const graph = sigma.getGraph();
      const sourceAttrs = graph.getNodeAttributes(sourceRef.current);
      const sourceViewport = sigma.graphToViewport({
        x: sourceAttrs.x,
        y: sourceAttrs.y,
      });

      const target = findNodeAtViewport(
        sigma,
        coords.x,
        coords.y,
        sourceRef.current,
      );
      targetRef.current = target;

      const canvases = sigma.getCanvases();
      const mouseCanvas = canvases.mouse;
      const ctx = mouseCanvas.getContext("2d");
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      ctx.clearRect(0, 0, mouseCanvas.width, mouseCanvas.height);
      ctx.save();
      ctx.scale(dpr, dpr);

      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = targetRef.current ? "#a78bfa" : "#8b5cf6";
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.8;
      ctx.beginPath();
      ctx.moveTo(sourceViewport.x, sourceViewport.y);
      ctx.lineTo(coords.x, coords.y);
      ctx.stroke();

      if (targetRef.current) {
        const targetAttrs = graph.getNodeAttributes(targetRef.current);
        const targetViewport = sigma.graphToViewport({
          x: targetAttrs.x,
          y: targetAttrs.y,
        });
        ctx.beginPath();
        ctx.arc(targetViewport.x, targetViewport.y, 10, 0, Math.PI * 2);
        ctx.strokeStyle = "#a78bfa";
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.6;
        ctx.setLineDash([]);
        ctx.stroke();
      }

      ctx.restore();
    },
    [sigma],
  );

  const handleMouseUp = useCallback(() => {
    if (sourceRef.current && targetRef.current) {
      onLinkNodes(sourceRef.current, targetRef.current);
    }
    sourceRef.current = null;
    targetRef.current = null;
    clearCanvas();
  }, [onLinkNodes, clearCanvas]);

  useEffect(() => {
    registerEvents({
      downNode: handleDownNode,
      mousemovebody: handleMouseMove,
      mouseup: handleMouseUp,
    });
  }, [registerEvents, handleDownNode, handleMouseMove, handleMouseUp]);

  return null;
}
