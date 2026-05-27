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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(
  record: Record<string, unknown>,
  key: string,
): string | null {
  const value = record[key];
  return typeof value === "string" ? value : null;
}

function readNumber(
  record: Record<string, unknown>,
  key: string,
): number | null {
  const value = record[key];
  return typeof value === "number" ? value : null;
}

function readTrace(record: Record<string, unknown>): CloudMemoryRef["trace"] {
  const trace = record.trace;
  if (!isRecord(trace)) return undefined;

  const score = readNumber(trace, "score");
  const reason = readString(trace, "reason");
  const breakdown = trace.scoreBreakdown;
  if (score === null || reason === null || !isRecord(breakdown)) {
    return undefined;
  }

  const fulltext = readNumber(breakdown, "fulltext");
  const vector = readNumber(breakdown, "vector");
  const recency = readNumber(breakdown, "recency");
  const confidence = readNumber(breakdown, "confidence");
  if (
    fulltext === null ||
    vector === null ||
    recency === null ||
    confidence === null
  ) {
    return undefined;
  }

  return {
    score,
    reason,
    scoreBreakdown: { fulltext, vector, recency, confidence },
  };
}

function collectMemoryRow(collector: MemoryRefCollector, row: unknown): void {
  if (!isRecord(row)) return;

  const id = readString(row, "id");
  const title = readString(row, "title");
  if (!id || !title) return;

  collector.add(id, title, readTrace(row));
}

function collectFromMemoryList(
  collector: MemoryRefCollector,
  data: unknown,
): void {
  if (!isRecord(data)) return;

  const memories = data.memories;
  if (!Array.isArray(memories)) return;

  for (const memory of memories) {
    collectMemoryRow(collector, memory);
  }
}

/** Collects memory ids/titles from cloud chat tool results for badge UI. */
export class MemoryRefCollector {
  private refs = new Map<string, CloudMemoryRef>();

  add(id: string, title: string, trace?: CloudMemoryRef["trace"]): void {
    const existing = this.refs.get(id);
    if (existing && !trace) return;
    this.refs.set(id, { id, title, trace: trace ?? existing?.trace });
  }

  collectFromTool(toolName: string, data: unknown): void {
    if (toolName === "memory_add") {
      if (!isRecord(data)) return;
      const id = readString(data, "id");
      const title = readString(data, "title");
      if (id && title) this.add(id, title);
      return;
    }

    if (
      toolName === "memory_search" ||
      toolName === "memory_retrieve" ||
      toolName === "memory_add_instruction"
    ) {
      collectFromMemoryList(this, data);
      if (toolName === "memory_add_instruction" && isRecord(data)) {
        const created = data.created;
        if (Array.isArray(created)) {
          for (const row of created) {
            collectMemoryRow(this, row);
          }
        }
      }
    }
  }

  getRefs(): CloudMemoryRef[] {
    return Array.from(this.refs.values());
  }
}
