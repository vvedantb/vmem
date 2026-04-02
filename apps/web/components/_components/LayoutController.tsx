"use client";

import { useEffect } from "react";
import { useWorkerLayoutForceAtlas2 } from "@react-sigma/layout-forceatlas2";
import type { GraphSettings } from "./graph-types";

interface LayoutControllerProps {
  settings: GraphSettings;
}

export default function LayoutController({ settings }: LayoutControllerProps) {
  const { start, stop, isRunning } = useWorkerLayoutForceAtlas2({
    settings: {
      scalingRatio: settings.scalingRatio,
      gravity: settings.gravity,
      linLogMode: false,
      outboundAttractionDistribution: true,
      adjustSizes: false,
      edgeWeightInfluence: 1,
      strongGravityMode: false,
      slowDown: 4,
      barnesHutOptimize: true,
      barnesHutTheta: 0.5,
    },
  });

  useEffect(() => {
    start();
    return () => {
      stop();
    };
  }, [start, stop]);

  useEffect(() => {
    if (isRunning) {
      stop();
      start();
    }
  }, [settings.scalingRatio, settings.gravity]);

  return null;
}
