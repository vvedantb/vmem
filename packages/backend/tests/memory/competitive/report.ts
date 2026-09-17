import type { AggMetrics } from "../../../eval/benchmark";

export const MISSING_CELL = "—";

export type SystemRow =
  | {
      status: "ok";
      name: string;
      metrics: AggMetrics;
      notes: string;
    }
  | {
      status: "missing";
      name: string;
      reason: string;
    };

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function mdTable(header: string[], rows: string[][]): string {
  return [header, header.map(() => "---"), ...rows]
    .map((cells) => `| ${cells.join(" | ")} |`)
    .join("\n");
}

function metricCells(metrics: AggMetrics): string[] {
  return [
    pct(metrics.recall1),
    pct(metrics.recall3),
    pct(metrics.recall5),
    pct(metrics.recall10),
    metrics.mrr.toFixed(3),
    metrics.ndcg10.toFixed(3),
    metrics.latencyP50.toFixed(0),
    metrics.latencyP95.toFixed(0),
  ];
}

const EMPTY_METRIC_CELLS = Array.from({ length: 8 }, () => MISSING_CELL);

export function competitiveTable(rows: readonly SystemRow[]): string {
  return mdTable(
    [
      "System",
      "recall@1",
      "recall@3",
      "recall@5",
      "recall@10",
      "MRR",
      "nDCG@10",
      "p50 ms",
      "p95 ms",
      "notes",
    ],
    rows.map((row) => {
      if (row.status === "missing") {
        return [row.name, ...EMPTY_METRIC_CELLS, row.reason];
      }
      return [row.name, ...metricCells(row.metrics), row.notes];
    }),
  );
}

export function competitiveLiveReport(args: {
  generated: string;
  memoryCount: number;
  answerable: number;
  abstention: number;
  queryCount: number;
  embeddingNote: string;
  subsetNote: string;
  rows: readonly SystemRow[];
}): string {
  return `# Live labelled IR — vmem vs Mem0 vs SuperMemory

Generated: ${args.generated} · Memories ingested: ${String(args.memoryCount)} · Queries: ${String(args.queryCount)} (${String(args.answerable)} answerable / ${String(args.abstention)} abstention)
${args.subsetNote}

Embeddings / rankers: ${args.embeddingNote}

${competitiveTable(args.rows)}

Cells that are ${MISSING_CELL} were not measured in this run. Do not fill them with vendor blog numbers or previous Jev hard-drop scores.
`;
}
