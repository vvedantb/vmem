export interface RetrievalEvalQuery {
  query: string;
  expectedTitles: string[];
}

export const RETRIEVAL_EVAL_USER_ID = "user_39IXNJeQM9vlRyQ9IdCvKbsqsti";

export const RETRIEVAL_EVAL_QUERIES: RetrievalEvalQuery[] = [
  {
    query: "strict null hooks server components",
    expectedTitles: [
      "TypeScript strict mode benefits",
      "React Server Components mental model",
      "React useEffect cleanup patterns",
    ],
  },
  {
    query: "mcp oauth resources integration",
    expectedTitles: [
      "Decision: MCP over REST for LLM integration",
      "Sprint review: MCP server progress",
      "Decided to migrate auth to Clerk",
    ],
  },
  {
    query: "graph visualization stutter sigma canvas",
    expectedTitles: [
      "Sprint planning: graph visualization",
      "Bug triage: graph rendering stutter",
      "Sigma.js WebGL rendering",
    ],
  },
  {
    query: "Neo4j traversal batch inserts APOC GDS",
    expectedTitles: [
      "PostgreSQL vs Neo4j for graph queries",
      "Neo4j Cypher UNWIND for batch inserts",
      "Neo4j APOC procedures",
      "Learning Neo4j graph data science library",
    ],
  },
  {
    query: "Japan travel metro ramen Kyoto",
    expectedTitles: [
      "Tokyo metro tip: get a Suica card",
      "Loved the ramen in Shibuya",
      "Kyoto temple etiquette",
      "Japanese phrase: sumimasen",
    ],
  },
  {
    query: "health routine deadlift running jet lag",
    expectedTitles: [
      "Started 5x5 deadlift program",
      "Running: 5K three times a week",
      "Jet lag strategy: no sleep on plane",
    ],
  },
  {
    query: "personal coding preferences dark mode vim typescript",
    expectedTitles: [
      "Prefers dark mode in all editors",
      "IDE setup: VS Code with Vim keybindings",
      "Prefers TypeScript over JavaScript",
    ],
  },
  {
    query: "thesis advisor benchmarks publication defense",
    expectedTitles: [
      "Thesis advisor feedback",
      "Goal: publish thesis by December",
      "Thesis defense preparation",
      "Demo prep for thesis committee",
    ],
  },
];
