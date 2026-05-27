import type { StoreFromInstructionResult } from "../../convex/neo4jActions/agent/storeFromInstruction";
import type {
  McpCreateMemoryResult,
  McpRetrieveMemoriesResult,
  McpSearchMemoriesResult,
} from "../../convex/mcp/toolResults";
import type {
  MemoryCandidate,
  MemoryWithTags,
} from "../../src/neo4j/memory/types";

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

function traceFromCandidate(
  candidate: MemoryCandidate,
): CloudMemoryRef["trace"] {
  return {
    score: candidate.trace.score,
    reason: candidate.trace.reason,
    scoreBreakdown: {
      fulltext: candidate.trace.scoreBreakdown.fulltext,
      vector: candidate.trace.scoreBreakdown.vector,
      recency: candidate.trace.scoreBreakdown.recency,
      confidence: candidate.trace.scoreBreakdown.confidence,
    },
  };
}

/** Collects memory ids/titles from cloud chat tool results for badge UI. */
export class MemoryRefCollector {
  private refs = new Map<string, CloudMemoryRef>();

  add(id: string, title: string, trace?: CloudMemoryRef["trace"]): void {
    const existing = this.refs.get(id);
    if (existing && !trace) return;
    this.refs.set(id, { id, title, trace: trace ?? existing?.trace });
  }

  private addMemory(memory: MemoryWithTags, trace?: CloudMemoryRef["trace"]) {
    this.add(memory.id, memory.title, trace);
  }

  collectMemorySearch(data: McpSearchMemoriesResult): void {
    for (const memory of data.memories) {
      this.addMemory(memory);
    }
  }

  collectMemoryRetrieve(data: McpRetrieveMemoriesResult): void {
    for (const memory of data) {
      this.addMemory(memory, traceFromCandidate(memory));
    }
  }

  collectMemoryAdd(data: McpCreateMemoryResult): void {
    this.addMemory(data);
  }

  collectMemoryAddInstruction(data: StoreFromInstructionResult): void {
    for (const memory of data.created) {
      this.addMemory(memory);
    }
  }

  getRefs(): CloudMemoryRef[] {
    return Array.from(this.refs.values());
  }
}
