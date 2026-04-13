import { type Driver } from "neo4j-driver";

interface CodeFileInput {
  path: string;
  directory: string;
  filename: string;
  extension: string;
  sizeBytes: number;
}

interface ImportEdgeInput {
  sourcePath: string;
  targetPath: string;
  importPath: string;
}

interface CodeFileNode {
  id: string;
  path: string;
  directory: string;
  filename: string;
  extension: string;
  sizeBytes: number;
}

interface ImportEdge {
  source: string;
  target: string;
  importPath: string;
}

export class CodebaseService {
  constructor(private driver: Driver) {}

  async syncCodebase(
    userId: string,
    codebaseId: string,
    files: CodeFileInput[],
    edges: ImportEdgeInput[],
  ): Promise<{ totalFiles: number; totalEdges: number }> {
    const deleteSession = this.driver.session();
    try {
      await deleteSession.run(
        `MATCH (f:CodeFile { userId: $userId, codebaseId: $codebaseId }) DETACH DELETE f`,
        { userId, codebaseId },
      );
    } finally {
      await deleteSession.close();
    }

    if (files.length === 0) return { totalFiles: 0, totalEdges: 0 };

    const BATCH_SIZE = 500;
    for (let i = 0; i < files.length; i += BATCH_SIZE) {
      const batch = files.slice(i, i + BATCH_SIZE);
      const session = this.driver.session();
      try {
        await session.run(
          `UNWIND $files AS f
           CREATE (n:CodeFile {
             id: f.path,
             userId: $userId,
             codebaseId: $codebaseId,
             path: f.path,
             directory: f.directory,
             filename: f.filename,
             extension: f.extension,
             sizeBytes: f.sizeBytes
           })`,
          { userId, codebaseId, files: batch },
        );
      } finally {
        await session.close();
      }
    }

    let totalEdges = 0;
    for (let i = 0; i < edges.length; i += BATCH_SIZE) {
      const batch = edges.slice(i, i + BATCH_SIZE);
      const session = this.driver.session();
      try {
        const result = await session.run(
          `UNWIND $edges AS e
           MATCH (src:CodeFile { userId: $userId, codebaseId: $codebaseId, path: e.sourcePath })
           MATCH (tgt:CodeFile { userId: $userId, codebaseId: $codebaseId, path: e.targetPath })
           CREATE (src)-[:IMPORTS { importPath: e.importPath }]->(tgt)
           RETURN count(*) AS created`,
          { userId, codebaseId, edges: batch },
        );
        const record = result.records[0];
        if (record) {
          const val = record.get("created");
          totalEdges += typeof val === "number" ? val : Number(val);
        }
      } finally {
        await session.close();
      }
    }

    return { totalFiles: files.length, totalEdges };
  }

  async getCodebaseGraph(
    userId: string,
    codebaseId: string,
  ): Promise<{ nodes: CodeFileNode[]; edges: ImportEdge[] }> {
    const session = this.driver.session();
    try {
      const nodesResult = await session.run(
        `MATCH (f:CodeFile { userId: $userId, codebaseId: $codebaseId })
         RETURN f.id AS id, f.path AS path, f.directory AS directory,
                f.filename AS filename, f.extension AS extension,
                f.sizeBytes AS sizeBytes`,
        { userId, codebaseId },
      );

      const nodes: CodeFileNode[] = nodesResult.records.map((r) => ({
        id: String(r.get("id")),
        path: String(r.get("path")),
        directory: String(r.get("directory")),
        filename: String(r.get("filename")),
        extension: String(r.get("extension")),
        sizeBytes: Number(r.get("sizeBytes")),
      }));

      const edgesResult = await session.run(
        `MATCH (src:CodeFile { userId: $userId, codebaseId: $codebaseId })
               -[rel:IMPORTS]->(tgt:CodeFile)
         RETURN src.id AS source, tgt.id AS target, rel.importPath AS importPath`,
        { userId, codebaseId },
      );

      const edges: ImportEdge[] = edgesResult.records.map((r) => ({
        source: String(r.get("source")),
        target: String(r.get("target")),
        importPath: String(r.get("importPath")),
      }));

      return { nodes, edges };
    } finally {
      await session.close();
    }
  }

  async deleteCodebase(userId: string, codebaseId: string): Promise<void> {
    const session = this.driver.session();
    try {
      await session.run(
        `MATCH (f:CodeFile { userId: $userId, codebaseId: $codebaseId }) DETACH DELETE f`,
        { userId, codebaseId },
      );
    } finally {
      await session.close();
    }
  }
}
