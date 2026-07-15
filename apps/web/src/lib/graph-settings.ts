export interface GraphSettings {
  scalingRatio: number;
  gravity: number;
  showLabels: boolean;
}

export const DEFAULT_GRAPH_SETTINGS: GraphSettings = {
  scalingRatio: 10,
  gravity: 0.5,
  showLabels: true,
};
