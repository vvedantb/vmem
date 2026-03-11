import neo4j, { Driver } from "neo4j-driver";

let driver: Driver | null = null;

export function getDriver(): Driver {
  if (driver) return driver;

  const uri = process.env.NEO4J_URI ?? "";
  const user = process.env.NEO4J_USERNAME ?? "neo4j";
  const password = process.env.NEO4J_PASSWORD ?? "";

  driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
  return driver;
}

export async function verifyConnectivity(): Promise<void> {
  const d = getDriver();
  try {
    await d.verifyConnectivity();
  } catch (err) {
    driver = null;
    throw new Error(
      `Neo4j connection failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

export async function closeDriver(): Promise<void> {
  if (driver) {
    await driver.close();
    driver = null;
  }
}
