import neo4j, { type Driver } from "neo4j-driver";

let driver: Driver | null = null;

export function getDriver(): Driver {
  if (driver) return driver;

  const uri = process.env.NEO4J_URI ?? "";
  const user = process.env.NEO4J_USERNAME ?? "neo4j";
  const password = process.env.NEO4J_PASSWORD ?? "";

  // Pool tuning for Convex `"use node"` containers calling Neo4j Aura:
  // - `maxConnectionPoolSize: 10` — default is 100. Convex action containers
  //   live for minutes-to-hours, never open hundreds of concurrent connections,
  //   and a smaller pool warms up faster on cold-start.
  // - `connectionAcquisitionTimeout: 10_000` — default is 60s. Fail fast if
  //   the pool is exhausted instead of letting a request hang a full minute.
  // - `connectionLivenessCheckTimeout: 2000` — default is no liveness check.
  //   Aura (and most managed Neo4j) silently drops idle TCP connections after
  //   a few minutes; without this, the first query on a stale connection
  //   waits for a TCP timeout before the driver retries. 2s means connections
  //   idle longer than 2s get a cheap ping before reuse.
  //
  // Both the pool size and acquisition timeout are overridable via env vars,
  // defaulting to the production values above. Batch CLI workloads (the
  // benchmark harness) run against the same Aura free tier but with a very
  // different access pattern — bursts of concurrent sessions after idle gaps —
  // where a larger pool and a longer acquisition timeout absorb the burst
  // instead of failing fast. Production (no env vars set) is unchanged.
  const maxPool = Number(process.env.NEO4J_MAX_POOL_SIZE) || 10;
  const acqTimeout =
    Number(process.env.NEO4J_CONNECTION_ACQUISITION_TIMEOUT_MS) || 10_000;
  driver = neo4j.driver(uri, neo4j.auth.basic(user, password), {
    maxConnectionPoolSize: maxPool,
    connectionAcquisitionTimeout: acqTimeout,
    connectionLivenessCheckTimeout: 2000,
  });
  return driver;
}

export async function closeDriver(): Promise<void> {
  if (driver) {
    await driver.close();
    driver = null;
  }
}
