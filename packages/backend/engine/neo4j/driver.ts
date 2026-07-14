import neo4j, { type Driver } from "neo4j-driver";

let driver: Driver | null = null;

export function getDriver(): Driver {
  if (driver) return driver;

  const uri = process.env.NEO4J_URI ?? "";
  const user = process.env.NEO4J_USERNAME ?? "neo4j";
  const password = process.env.NEO4J_PASSWORD ?? "";

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
