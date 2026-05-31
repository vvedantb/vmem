export interface CloudMemoryRef {
  id: string;
  title: string;
  trace?: {
    score: number;
    scoreBreakdown: {
      fulltext: number;
      vector: number;
      recency: number;
      confidence: number;
    };
    reason: string;
  };
}
