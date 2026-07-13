export interface RetrievalEvalQuery {
  query: string;
  expectedTitles: string[];
  relevance?: Record<string, number>;
  type?: string;
}
