import type { Session } from "neo4j-driver";
import type { Clause, CypherResult } from "@neo4j/cypher-builder";

export function buildAndRun(
  session: Session,
  clause: Clause,
): ReturnType<Session["run"]> {
  const { cypher, params }: CypherResult = clause.build();
  return session.run(cypher, params);
}
