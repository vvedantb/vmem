export interface RetrievalEvalQuery {
  query: string;
  expectedTitles: string[];
  /**
   * Optional graded relevance (title → grade, e.g. 3 = high, 2 = medium,
   * 1 = marginal) for nDCG. Titles in `expectedTitles` default to grade 1 when
   * absent here, so binary-only queries still work.
   */
  relevance?: Record<string, number>;
  /** Optional query-type tag (single-fact | multi-hop | temporal | update | preference). */
  type?: string;
}
